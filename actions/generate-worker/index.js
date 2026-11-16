// Background worker that renders the contact sheet to PDF via Adobe PDF Services and saves it back to AEM.
// Follows §7.4–7.6 of docs/mvp-architecture.md:
//   1. Load model & config
//   2. Fetch thumbnails by assetId (concurrency 8)
//   3. Build index.html + images ZIP
//   4. Convert via Adobe PDF Services HTML-to-PDF
//   5. Upload to AEM (user's chosen folder in Assets View, or Content Hub Author copy folder via technical account)
//   6. Verify uploaded asset metadata before reporting succeeded

import { paginate } from '../../packages/core/layout.js';
import { renderHtml } from '../../packages/core/render.js';
import { createAemClient } from '../lib/aem.js';
import { buildZipBuffer } from '../lib/zip.js';
import { convertHtmlZipToPdf, getServerToServerToken } from '../lib/pdf-services.js';
import { renderNativePdfBuffer } from '../lib/pdf-native.js';
import { getPresignedDownloadUrl, loadJob, readFileObject, saveJob, writeFileObject } from '../lib/store.js';
import { mapWithConcurrency } from '../lib/utils.js';

export function buildPdfFileName(title = 'contact-sheet', customName = '') {
  if (customName && customName.trim().endsWith('.pdf')) {
    return customName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  }
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'contact-sheet';
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  return `${slug}_${stamp}.pdf`;
}

export async function main(params = {}) {
  const {
    jobId,
    modelFileKey,
    inlineModel,
    config,
    tier = 'author',
    aemHost,
    deliveryHost,
    auth = {},
    fetchImpl = globalThis.fetch,
    pdfConvertImpl = convertHtmlZipToPdf,
  } = params;

  const job = {
    ...(await loadJob(jobId)),
    id: jobId,
    type: 'generate',
    userId: auth.userId,
    userHash: auth.userHash,
    orgId: auth.imsOrg,
    warnings: [],
    createdAt: new Date().toISOString(),
  };

  try {
    // 1. Load model & paginate
    job.status = 'running';
    job.phase = 'images';
    await saveJob(job);

    let model = inlineModel;
    if (!model && modelFileKey) {
      const rawJson = await readFileObject(modelFileKey, true);
      if (!rawJson) throw new Error(`Resolved model not found at ${modelFileKey}`);
      model = JSON.parse(rawJson);
    }

    const paginated = paginate(model, config);
    const warnings = [...paginated.warnings];

    const aem = createAemClient({
      aemHost: aemHost || model.aemHost,
      deliveryHost: deliveryHost || model.deliveryHost,
      bearerToken: auth.bearerToken,
      imsOrg: auth.imsOrg,
      apiKey: auth.apiKey,
      fetchImpl,
    });

    // Collect ordered assets from paginated blocks
    const orderedAssets = [];
    for (const page of paginated.pages) {
      for (const block of page.blocks) {
        if (block.type === 'row') {
          orderedAssets.push(...block.cells);
        }
      }
    }

    job.progress = { done: 0, total: orderedAssets.length };
    await saveJob(job);

    // 2. Fetch thumbnails (concurrency 8) keyed by asset.id — never by filename
    const imageMap = new Map();
    const imageBuffersByAssetId = new Map();
    const zipEntries = [];
    const targetPx = paginated.geometry.targetImagePx;
    const quality = paginated.config.output?.quality || 'screen';
    let missingImages = 0;

    await mapWithConcurrency(
      orderedAssets,
      8,
      async (asset) => {
        try {
          const { buffer, ext } = await aem.fetchAssetThumbnailBuffer(asset, { targetPx, quality });
          const zipPath = `img/${asset.sequence}.${ext}`;
          imageMap.set(asset.id, zipPath);
          imageBuffersByAssetId.set(asset.id, { buffer, ext });
          zipEntries.push({ name: zipPath, data: buffer });
        } catch {
          missingImages++;
        }
      },
      async (done, total) => {
        if (done === total || done % 10 === 0) {
          job.progress = { done, total };
          await saveJob(job);
        }
      }
    );

    if (missingImages > 0) {
      warnings.push(`${missingImages} asset(s) had no available rendition; placeholder tiles were used.`);
    }

    // Optional header logo from AEM (R4, §7.6)
    let logoZipPath = null;
    let logoEntry = null;
    const logoRef = paginated.config.header?.logo;
    if (logoRef?.assetId) {
      try {
        const { buffer, ext } = await aem.fetchAssetThumbnailBuffer(
          { id: logoRef.assetId, name: logoRef.path?.split('/').pop() || 'logo.png', approved: logoRef.tier === 'delivery' },
          { targetPx: 600, quality: 'print' }
        );
        logoZipPath = `img/logo.${ext}`;
        logoEntry = { buffer, ext };
        zipEntries.push({ name: logoZipPath, data: buffer });
      } catch {
        warnings.push('Selected header logo could not be fetched; generated without logo.');
      }
    }

    // 3. Render HTML & package ZIP with index.html at top level
    const html = renderHtml(paginated, {
      mode: 'pdf',
      model,
      imageResolver: (asset) => imageMap.get(asset.id) || null,
      logoUrl: logoZipPath,
    });
    zipEntries.unshift({ name: 'index.html', data: Buffer.from(html, 'utf8') });
    const zipBuffer = buildZipBuffer(zipEntries);

    // 4. Convert to PDF (Adobe PDF Services HTML-to-PDF if credentials configured; otherwise built-in pdf-lib vector renderer)
    job.phase = 'pdf';
    await saveJob(job);

    const fileName = buildPdfFileName(paginated.config.header?.title, paginated.config.output?.fileName);
    const hasPdfCreds = Boolean(params.PDF_SERVICES_CLIENT_ID && params.PDF_SERVICES_CLIENT_SECRET);
    let pdfBuffer = null;

    if (hasPdfCreds || pdfConvertImpl !== convertHtmlZipToPdf) {
      pdfBuffer = await pdfConvertImpl({
        zipBuffer,
        pageWidthIn: paginated.geometry.pageW,
        pageHeightIn: paginated.geometry.pageH,
        clientId: params.PDF_SERVICES_CLIENT_ID,
        clientSecret: params.PDF_SERVICES_CLIENT_SECRET,
        fetchImpl,
      });
    } else {
      pdfBuffer = await renderNativePdfBuffer(paginated, {
        model,
        imageBuffersByAssetId,
        logoEntry,
      });
    }

    let downloadUrl = null;
    const pdfFileKey = `pdfs/${auth.imsOrg}/${auth.userHash}/${jobId}/${fileName}`;
    try {
      await writeFileObject(pdfFileKey, pdfBuffer);
      downloadUrl = await getPresignedDownloadUrl(pdfFileKey, 86400);
    } catch {
      // If App Builder Files isn't provisioned yet, provide a base64 data URL if under 700 KB
      if (pdfBuffer.byteLength < 700_000) {
        downloadUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
      }
    }

    // 5 & 6. Save to AEM Author + verify (§7.4 steps 5–6 and §7.5)
    job.phase = 'upload';
    await saveJob(job);

    let uploaded = null;
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

    try {
      if (tier === 'delivery') {
        // Content Hub: user gets download, and we save an archival copy to AEM Author using the technical account
        const techToken = params.AEM_TECH_CLIENT_ID && params.AEM_TECH_CLIENT_SECRET
          ? await getServerToServerToken({
              clientId: params.AEM_TECH_CLIENT_ID,
              clientSecret: params.AEM_TECH_CLIENT_SECRET,
              scopes: params.AEM_TECH_SCOPES || 'openid,AdobeID,aem.assets.author',
              fetchImpl,
            })
          : auth.bearerToken;

        const authorWriter = createAemClient({
          aemHost: aemHost || model.aemHost,
          deliveryHost: deliveryHost || model.deliveryHost,
          bearerToken: techToken,
          imsOrg: auth.imsOrg,
          apiKey: params.AEM_TECH_CLIENT_ID || auth.apiKey,
          fetchImpl,
        });

        job.phase = 'verify';
        await saveJob(job);
        uploaded = await authorWriter.uploadPdfAndVerify({
          folderPath: `/content/dam/contact-sheets/content-hub/${yyyy}/${mm}`,
          fileName,
          pdfBuffer,
          title: paginated.config.header?.title,
          sourceLabel: model.sourceLabel,
          assetCount: paginated.totalAssets,
          createdBy: auth.userEmail || auth.userId,
        });
      } else {
        // Assets View: upload to user's chosen folder using user's own token
        const targetFolder = paginated.config.output?.targetFolder?.path || `/content/dam/contact-sheets/${yyyy}/${mm}`;
        job.phase = 'verify';
        await saveJob(job);
        uploaded = await aem.uploadPdfAndVerify({
          folderPath: targetFolder,
          fileName,
          pdfBuffer,
          title: paginated.config.header?.title,
          sourceLabel: model.sourceLabel,
          assetCount: paginated.totalAssets,
          createdBy: auth.userEmail || auth.userId,
        });
      }
    } catch (uploadErr) {
      warnings.push(`Saved PDF for download, but could not upload to AEM (${uploadErr.message}).`);
    }

    job.status = warnings.length ? 'succeeded_with_warnings' : 'succeeded';
    job.phase = 'done';
    job.warnings = warnings;
    job.result = {
      pdfFileKey,
      downloadUrl,
      fileName,
      pages: paginated.totalPages,
      assets: paginated.totalAssets,
      bytes: pdfBuffer.byteLength,
      aemAssetId: uploaded?.assetId || null,
      aemPath: uploaded?.path || null,
    };
    await saveJob(job);
    return job;
  } catch (err) {
    job.status = 'failed';
    job.warnings = job.warnings || [];
    job.error = {
      code: err.code || 'GENERATE_FAILED',
      message: err.message || 'Failed generating contact sheet PDF',
      retryable: err.retryable !== false,
    };
    await saveJob(job);
    return job;
  }
}
