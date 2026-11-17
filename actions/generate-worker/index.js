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
import { exportContactSheetToFireflyBoard } from '../lib/firefly-boards.js';
import { exportContactSheetToAdobeExpress } from '../lib/adobe-express.js';
import { buildZipBuffer } from '../lib/zip.js';
import { convertHtmlZipToPdf, getServerToServerToken } from '../lib/pdf-services.js';
import { renderNativePdfBuffer } from '../lib/pdf-native.js';
import { getPresignedDownloadUrl, loadJob, readFileObject, saveJob, savePdfChunks, writeFileObject } from '../lib/store.js';
import { mapWithConcurrency } from '../lib/utils.js';

export function buildPdfFileName(title = 'contact-sheet', customName = '') {
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug =
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'contact-sheet';
  if (customName && customName.trim().endsWith('.pdf') && !/^contact-sheet_\d{4}-\d{2}-\d{2}\.pdf$/i.test(customName.trim())) {
    const base = customName.trim().replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    return `${base}.pdf`;
  }
  return `${slug}_${dateStr}.pdf`;
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

    const outputFormat = params.outputFormat || config?.output?.format || 'pdf';
    if (outputFormat === 'boards') {
      job.phase = 'boards';
      await saveJob(job);

      const boardRes = await exportContactSheetToFireflyBoard({
        model,
        config,
        aem,
        bearerToken: String(params.boardsBearerToken || '').trim().replace(/^Bearer\s+/i, '') || auth.bearerToken,
        shareEmail: params.boardsShareEmail || auth.userEmail || null,
        fetchImpl,
        onProgress: async (done, total) => {
          job.progress = { done, total };
          await saveJob(job);
        },
      });

      job.status = boardRes.warnings.length ? 'succeeded_with_warnings' : 'succeeded';
      job.phase = 'done';
      job.warnings = boardRes.warnings;
      job.result = {
        outputFormat: 'boards',
        boardId: boardRes.boardId,
        boardUrl: boardRes.boardUrl,
        placedCards: boardRes.placedCards,
        assets: boardRes.totalAssets,
      };
      await saveJob(job);
      return job;
    }

    if (outputFormat === 'express') {
      job.phase = 'express';
      await saveJob(job);
      const targetToken =
        String(params.boardsBearerToken || '').trim().replace(/^Bearer\s+/i, '') || auth.bearerToken;
      const shareEmails = [params.boardsShareEmail, auth.userEmail].filter(Boolean);
      try {
        const expressRes = await exportContactSheetToAdobeExpress({
          jobId,
          paginated,
          model,
          aem,
          bearerToken: targetToken,
          shareWithEmails: shareEmails,
          fetchImpl,
          onProgress: async (done, total) => {
            job.progress = { done, total };
            await saveJob(job);
          },
        });
        job.status = warnings.length ? 'succeeded_with_warnings' : 'succeeded';
        job.phase = 'done';
        job.warnings = warnings;
        job.result = {
          outputFormat: 'express',
          expressMode: 'direct',
          documentId: expressRes.documentId,
          expressUrl: expressRes.expressUrl,
          sharedLinkEnabled: expressRes.sharedLinkEnabled,
          sharedWith: expressRes.sharedWith,
          pages: expressRes.pages,
          assets: expressRes.placedAssets,
        };
        await saveJob(job);
        return job;
      } catch (expressErr) {
        const reason =
          expressErr.code === 'TOKEN_EXPIRED'
            ? 'Your saved token for the target IMS Org has expired — please paste a fresh token in Target IMS Org / Profile.'
            : expressErr.code === 'UserNotEntitled'
            ? 'The selected IMS Org is not entitled to Adobe Express — select your Express-entitled Target IMS Org token.'
            : expressErr.code || 'direct cloud creation requires an Express/Firefly token in Target IMS Org';
        warnings.push(
          `Prepared editable multi-page PDF for Adobe Express import (${reason})`
        );
      }
    }

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
    const hasPdfCreds = Boolean(params.PDF_SERVICES_CLIENT_ID && params.PDF_SERVICES_CLIENT_SECRET);
    const useZipPipeline = hasPdfCreds || pdfConvertImpl !== convertHtmlZipToPdf;
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
          if (useZipPipeline) {
            zipEntries.push({ name: zipPath, data: buffer });
          } else {
            imageBuffersByAssetId.set(asset.id, { buffer, ext });
          }
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
        if (useZipPipeline) {
          zipEntries.push({ name: logoZipPath, data: buffer });
        }
      } catch {
        warnings.push('Selected header logo could not be fetched; generated without logo.');
      }
    }

    // Optional custom watermark font from AEM DAM (e.g. `/content/dam/fonts/*.ttf` or `*.otf`)
    let watermarkFontBuffer = null;
    let watermarkFontZipPath = null;
    const wmCfg = paginated.config.watermark;
    if (wmCfg?.enabled && wmCfg?.fontAssetId) {
      try {
        const fontFileName = wmCfg.fontName || wmCfg.fontPath?.split('/').pop() || 'watermark-font.ttf';
        watermarkFontBuffer = await aem.fetchAssetOriginalBuffer(wmCfg.fontAssetId, fontFileName);
        if (useZipPipeline && watermarkFontBuffer) {
          const ext = fontFileName.split('.').pop()?.toLowerCase() || 'ttf';
          watermarkFontZipPath = `fonts/watermark.${ext}`;
          zipEntries.push({ name: watermarkFontZipPath, data: watermarkFontBuffer });
        }
      } catch {
        warnings.push('Selected custom watermark font could not be loaded; fell back to standard bold font.');
      }
    }

    // 3 & 4. Convert to PDF (Adobe PDF Services HTML-to-PDF if credentials configured; otherwise built-in pdf-lib vector renderer)
    job.phase = 'pdf';
    await saveJob(job);

    const fileName = buildPdfFileName(paginated.config.header?.title, paginated.config.output?.fileName);
    let pdfBuffer = null;

    if (useZipPipeline) {
      const html = renderHtml(paginated, {
        mode: 'pdf',
        model,
        imageResolver: (asset) => imageMap.get(asset.id) || null,
        logoUrl: logoZipPath,
        watermarkFontUrl: watermarkFontZipPath,
      });
      zipEntries.unshift({ name: 'index.html', data: Buffer.from(html, 'utf8') });
      const zipBuffer = buildZipBuffer(zipEntries);
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
        watermarkFontBuffer,
      });
      imageBuffersByAssetId.clear();
    }

    let downloadUrl = null;
    const pdfFileKey = `pdfs/${auth.imsOrg}/${auth.userHash}/${jobId}/${fileName}`;
    try {
      await writeFileObject(pdfFileKey, pdfBuffer);
      downloadUrl = await getPresignedDownloadUrl(pdfFileKey, 86400);
    } catch {
      // ignore if App Builder Files is not provisioned
    }
    if (!downloadUrl && pdfBuffer.byteLength < 700_000) {
      downloadUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
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
        // Content Hub: user gets download, and we save an archival copy to AEM Author using the technical account (or user token with Author API key)
        const hasTechCreds =
          Boolean(params.AEM_TECH_CLIENT_ID && params.AEM_TECH_CLIENT_SECRET) &&
          !String(params.AEM_TECH_CLIENT_ID).startsWith('$');
        const techToken = hasTechCreds
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
          apiKey: hasTechCreds ? params.AEM_TECH_CLIENT_ID : 'aem-assets-frontend-1',
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
        let targetFolder = paginated.config.output?.targetFolder?.path;
        if (!targetFolder || targetFolder === '/content/dam/contact-sheets') {
          if (model?.source?.kind === 'folder' && model?.source?.path) {
            targetFolder = model.source.path;
          } else {
            targetFolder = `/content/dam/contact-sheets/${yyyy}/${mm}`;
          }
        }
        job.phase = 'verify';
        await saveJob(job);
        const fallbackSharedFolder = `/content/dam/contact-sheets/${yyyy}/${mm}`;
        try {
          uploaded = await aem.uploadPdfAndVerify({
            folderPath: targetFolder,
            fileName,
            pdfBuffer,
            title: paginated.config.header?.title,
            sourceLabel: model.sourceLabel,
            assetCount: paginated.totalAssets,
            createdBy: auth.userEmail || auth.userId,
          });
        } catch (primaryErr) {
          // If the user lacks write permission to the source/chosen folder, try the shared `/content/dam/contact-sheets/yyyy/mm` folder
          if (targetFolder !== fallbackSharedFolder) {
            uploaded = await aem.uploadPdfAndVerify({
              folderPath: fallbackSharedFolder,
              fileName,
              pdfBuffer,
              title: paginated.config.header?.title,
              sourceLabel: model.sourceLabel,
              assetCount: paginated.totalAssets,
              createdBy: auth.userEmail || auth.userId,
            });
            warnings.push(
              `No write access to ${targetFolder}; saved contact sheet to ${fallbackSharedFolder} instead.`
            );
          } else {
            throw primaryErr;
          }
        }
      }
    } catch {
      warnings.push(
        'Your account does not have write permission to save files into AEM Assets; your contact sheet PDF is ready for direct download below.'
      );
    }

    const finalDownloadUrl = uploaded?.downloadUrl || downloadUrl || null;
    // If AEM upload was skipped due to read-only permissions (`!uploaded?.assetId`) and PDF > 520 KB,
    // persist 42 KB State chunks so the read-only user can still download the full PDF immediately!
    let pdfChunkCount = 0;
    if (!uploaded?.assetId && pdfBuffer.byteLength > 520_000) {
      try {
        pdfChunkCount = await savePdfChunks(jobId, pdfBuffer);
      } catch {
        pdfChunkCount = 0;
      }
    }

    job.status = warnings.length ? 'succeeded_with_warnings' : 'succeeded';
    job.phase = 'done';
    job.warnings = warnings;
    job.result = {
      jobId,
      outputFormat: outputFormat === 'express' ? 'express' : 'pdf',
      ...(outputFormat === 'express'
        ? {
            expressMode: 'pdf_import',
            expressUrl: 'https://new.express.adobe.com/',
          }
        : {}),
      pdfFileKey,
      downloadUrl: finalDownloadUrl,
      pdfChunkCount,
      fileName: uploaded?.fileName || fileName,
      pages: paginated.totalPages,
      assets: paginated.totalAssets,
      bytes: pdfBuffer.byteLength,
      aemAssetId: uploaded?.assetId || null,
      aemPath: uploaded?.path || null,
    };
    await saveJob(job);
    // OpenWhisk max HTTP response payload is 1 MB (1,048,576 bytes).
    // Only attach inlinePdfBase64 when pdfBuffer <= 520 KB (~693 KB base64); larger PDFs use parallel `pdfChunkCount` fetches!
    if (pdfBuffer.byteLength <= 520_000) {
      return { ...job, inlinePdfBase64: pdfBuffer.toString('base64') };
    }
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
