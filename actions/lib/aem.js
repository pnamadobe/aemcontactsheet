// AEM Author & Delivery HTTP client using the caller's IMS token (or technical account for Content Hub Author copies).
import { CONTACT_SHEET_CREATOR_TOOL } from '../../packages/core/fields.js';
import { mapWithConcurrency, withRetry } from './utils.js';

/**
 * Given a desired PDF filename (e.g. `hertz-ads_2026-11-17.pdf`) and existing asset names in the target folder,
 * append a sequence number (`-1`, `-2`, `-3`, ...) if a file with the same name already exists.
 */
export function resolveUniqueFileName(desiredName, existingNames = []) {
  const cleanDesired = String(desiredName || 'contact-sheet.pdf').trim();
  const lowerSet = new Set(
    (Array.isArray(existingNames) ? existingNames : [...existingNames]).map((n) =>
      String(n || '').toLowerCase()
    )
  );
  if (!lowerSet.has(cleanDesired.toLowerCase())) {
    return cleanDesired;
  }
  const dotIdx = cleanDesired.lastIndexOf('.');
  const base = dotIdx > 0 ? cleanDesired.slice(0, dotIdx) : cleanDesired;
  const ext = dotIdx > 0 ? cleanDesired.slice(dotIdx) : '.pdf';
  let seq = 1;
  while (lowerSet.has(`${base}-${seq}${ext}`.toLowerCase())) {
    seq++;
  }
  return `${base}-${seq}${ext}`;
}

export function createAemClient({
  aemHost,
  deliveryHost,
  bearerToken,
  imsOrg,
  apiKey = 'aem-assets-frontend-1',
  fetchImpl = globalThis.fetch,
}) {
  const normAuthor = (aemHost || '').replace(/\/+$/, '');
  const normDelivery = (deliveryHost || normAuthor.replace(/^https:\/\/author-/, 'https://delivery-')).replace(/\/+$/, '');

  function buildHeaders(extra = {}) {
    const h = {
      Authorization: `Bearer ${bearerToken}`,
      'x-api-key': apiKey,
      'x-gw-ims-org-id': imsOrg,
      'X-Adobe-Accept-Experimental': '1',
      ...extra,
    };
    return h;
  }

  async function requestJson(baseUrl, path, { method = 'GET', query = null, body = null, headers = {} } = {}) {
    const url = new URL(`${baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }
    return await withRetry(async () => {
      const res = await fetchImpl(url.toString(), {
        method,
        headers: buildHeaders(body ? { 'content-type': 'application/json', ...headers } : headers),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`AEM ${method} ${path} failed (${res.status}): ${text.slice(0, 240)}`);
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      if (res.status === 204) return null;
      return await res.json();
    });
  }

  async function requestBuffer(baseUrl, path, { query = null } = {}) {
    const url = new URL(`${baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }
    return await withRetry(async () => {
      const res = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: buildHeaders(),
      });
      if (!res.ok) {
        const err = new Error(`AEM binary GET ${path} failed (${res.status})`);
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    });
  }

  /** List folder info and children on Author. */
  async function listFolder({ path = '/content/dam', folderId = null, types = 'FOLDER,ASSET', limit = 50, cursor = null } = {}) {
    const endpoint = folderId
      ? `/adobe/experimental/metaall-expires-20991231/folders/${encodeURIComponent(folderId)}`
      : '/adobe/experimental/metaall-expires-20991231/folders';
    const query = folderId ? { types, limit, cursor } : { path, types, limit, cursor };
    return await requestJson(normAuthor, endpoint, { query });
  }

  /**
   * Enrich Author asset hits with pre-signed `thumbnailUrl` (319px) and `downloadUrl` (full-resolution original)
   * from `/adobe/experimental/aemmcpserver-expires-20991231/search-assets` so Live Preview and Firefly Boards
   * have immediate access to both lightweight thumbnails and full-resolution originals.
   */
  async function enrichAuthorSignedUrls(rawAssets, folderPathHint = null) {
    if (!Array.isArray(rawAssets) || rawAssets.length === 0) return rawAssets;
    const needEnrich = rawAssets.filter((a) => !a.thumbnailUrl || !a.downloadUrl);
    if (needEnrich.length === 0) return rawAssets;

    const folderPaths = new Set();
    if (folderPathHint) folderPaths.add(folderPathHint);
    for (const a of needEnrich) {
      const p = a?.repositoryMetadata?.['repo:path'] || a?.path || '';
      const slash = p.lastIndexOf('/');
      if (slash > 0) folderPaths.add(p.slice(0, slash));
    }

    const targetIds = new Set(
      needEnrich
        .map((a) => a?.assetId || a?.id || a?.repositoryMetadata?.['repo:id'])
        .filter(Boolean)
    );
    const urlMap = new Map();
    for (const fp of [...folderPaths].slice(0, 6)) {
      try {
        let cursor = null;
        let fetched = 0;
        do {
          // IMPORTANT: AEM's `search-assets` only signs `downloadUrl` and `thumbnailUrl` for the first 10 items per response!
          // Always paginate with `limit: 10` so every page of 10 items receives signed URLs.
          const body = {
            termFilters: [{ key: 'repositoryMetadata.repo:ancestors', value: fp }],
            limit: 10,
          };
          if (cursor) body.cursor = cursor;
          const sRes = await requestJson(
            normAuthor,
            '/adobe/experimental/aemmcpserver-expires-20991231/search-assets',
            { method: 'POST', body }
          );
          const results = sRes?.results || [];
          for (const item of results) {
            const id = item?.assetId || item?.id;
            if (id && (item.thumbnailUrl || item.downloadUrl)) {
              urlMap.set(id, {
                thumbnailUrl: item.thumbnailUrl,
                downloadUrl: item.downloadUrl,
              });
            }
          }
          fetched += results.length;
          cursor = sRes?.cursor || null;
          if (targetIds.size > 0 && [...targetIds].every((id) => urlMap.has(id))) {
            break;
          }
        } while (cursor && fetched < Math.max(120, rawAssets.length + 30));
      } catch {
        // Non-fatal if search-assets endpoint is unavailable in test mocks
      }
    }

    if (urlMap.size > 0) {
      for (const a of rawAssets) {
        const id = a?.assetId || a?.id || a?.repositoryMetadata?.['repo:id'];
        const found = id ? urlMap.get(id) : null;
        if (found) {
          if (!a.thumbnailUrl && found.thumbnailUrl) a.thumbnailUrl = found.thumbnailUrl;
          if (!a.downloadUrl && found.downloadUrl) a.downloadUrl = found.downloadUrl;
        }
      }
    }
    return rawAssets;
  }

  /**
   * Bulk-resolve all assets under a folder using the verified S4 search endpoint (`repo:ancestors`).
   * Collects up to `maxScan` assets in pages of 100.
   */
  async function resolveFolderAssets({ folderId, folderPath, includeSubfolders = false, maxScan = 1000 }) {
    let resolvedFolderId = folderId;
    let resolvedPath = folderPath;
    if (!resolvedFolderId || !resolvedPath) {
      const info = await listFolder({ path: folderPath, folderId, types: 'FOLDER', limit: 1 });
      resolvedFolderId = resolvedFolderId || info?.self?.folderId;
      resolvedPath = resolvedPath || info?.self?.path || folderPath;
    }

    const allHits = [];
    let cursor = null;
    do {
      const body = {
        query: [{ term: { 'repositoryMetadata.repo:ancestors': [resolvedFolderId] } }],
        limit: 100,
      };
      if (cursor) body.cursor = cursor;
      const res = await requestJson(normAuthor, '/adobe/experimental/metaall-expires-20991231/assets/search', {
        method: 'POST',
        body,
      });
      const hits = res?.hits?.results || [];
      for (const h of hits) {
        if (!includeSubfolders && resolvedPath) {
          const assetPath = h?.repositoryMetadata?.['repo:path'] || '';
          const parentPath = assetPath.slice(0, assetPath.lastIndexOf('/')) || '/';
          if (parentPath !== resolvedPath) continue;
        }
        allHits.push(h);
      }
      cursor = res?.cursor || null;
    } while (cursor && allHits.length < maxScan);

    await enrichAuthorSignedUrls(allHits, resolvedPath);

    return {
      folderId: resolvedFolderId,
      folderPath: resolvedPath,
      assets: allHits,
    };
  }

  /**
   * Resolve collection items on Author (`STATIC` or `SMART`) or Delivery (`urn:cid:aem:...`).
   * On Delivery, S3 confirmed that `hits.results[]` already includes full metadata inline.
   */
  async function resolveCollectionAssets({ collectionId, tier = 'author', maxScan = 1000, onProgress = null }) {
    if (tier === 'delivery' || collectionId.startsWith('urn:cid:')) {
      const all = [];
      let cursor = null;
      do {
        const res = await requestJson(
          normDelivery,
          `/adobe/assets/collections/${encodeURIComponent(collectionId)}/items`,
          { query: { limit: 25, cursor } }
        );
        const page = res?.hits?.results || [];
        all.push(...page);
        cursor = res?.cursor || null;
        if (onProgress) await onProgress(all.length, res?.search_metadata?.totalCount?.total || all.length);
      } while (cursor && all.length < maxScan);
      return { collectionTitle: null, assets: all };
    }

    // Author collection: paginate items, then fetch metadata with concurrency 8
    const itemRefs = [];
    let collectionTitle = null;
    let cursor = null;
    do {
      const res = await requestJson(
        normAuthor,
        `/adobe/assets/collections/${encodeURIComponent(collectionId)}/items`,
        { query: { limit: 50, cursor } }
      );
      collectionTitle = collectionTitle || res?.self?.collectionMetadata?.title || res?.self?.repositoryMetadata?.['repo:name'];
      const items = res?.items || [];
      for (const it of items) {
        if (it?.id) itemRefs.push(it.id);
      }
      cursor = res?.cursor || null;
    } while (cursor && itemRefs.length < maxScan);

    const assets = await resolveSelectionAssets({
      items: itemRefs.map((id) => ({ id })),
      tier: 'author',
      onProgress,
    });
    return { collectionTitle, assets };
  }

  /** Resolve an explicit list of selected items (expanding any selected folders). */
  async function resolveSelectionAssets({ items = [], tier = 'author', includeSubfolders = false, onProgress = null }) {
    const base = tier === 'delivery' ? normDelivery : normAuthor;
    const expandedIds = [];
    const preloadedAssets = [];

    for (const item of items) {
      if (item.type === 'folder' || (item.path && !item.path.split('/').pop().includes('.') && !item.id?.includes('aaid'))) {
        const folderRes = await resolveFolderAssets({
          folderId: item.id,
          folderPath: item.path,
          includeSubfolders,
        });
        preloadedAssets.push(...folderRes.assets);
      } else if (item.id) {
        expandedIds.push(item.id);
      }
    }

    const hydrated = await mapWithConcurrency(
      expandedIds,
      8,
      async (assetId) => {
        try {
          return await requestJson(base, `/adobe/assets/${encodeURIComponent(assetId)}/metadata`);
        } catch {
          return null;
        }
      },
      onProgress
    );

    const combined = [...preloadedAssets, ...hydrated.filter(Boolean)];
    if (tier === 'author') {
      await enrichAuthorSignedUrls(combined);
    }
    return combined;
  }

  /**
   * Fetch the best thumbnail binary for an asset (S5):
   * 1. Approved + published -> Delivery Dynamic Media on-the-fly JPEG (`?width={targetPx}&quality={q}`)
   * 2. Unapproved Author -> static rendition (`cq5dam.thumbnail.319.319.png` or `cq5dam.web.1280.1280.jpeg`)
   */
  async function fetchAssetThumbnailBuffer(asset, { targetPx = 350, quality = 'screen' } = {}) {
    const seoName = (asset.name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'image';
    const jpgQuality = quality === 'print' ? 82 : 75;

    if (asset.approved || asset.published) {
      try {
        const buf = await requestBuffer(
          normDelivery,
          `/adobe/assets/${encodeURIComponent(asset.id)}/as/${seoName}.jpg`,
          { query: { width: targetPx, quality: jpgQuality } }
        );
        return { buffer: buf, ext: 'jpg', mime: 'image/jpeg' };
      } catch {
        // Fall through to Author static renditions
      }
    }

    // Author static rendition path:
    // Use `asset.thumbnailUrl` (pre-signed blob URL for `cq5dam.thumbnail.319.319.png` ~60–110 KB) for Screen quality
    // so 71 assets is ~5 MB instead of 65 MB!
    if (quality === 'screen' && asset.thumbnailUrl) {
      try {
        const res = await fetchImpl(asset.thumbnailUrl);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          return { buffer: Buffer.from(ab), ext: 'png', mime: 'image/png' };
        }
      } catch {
        // fall through
      }
    }

    const candidates =
      quality === 'screen'
        ? [
            { name: 'cq5dam.thumbnail.319.319.png', ext: 'png', mime: 'image/png' },
            { name: 'cq5dam.web.1280.1280.jpeg', ext: 'jpg', mime: 'image/jpeg' },
          ]
        : [
            { name: 'cq5dam.web.1280.1280.jpeg', ext: 'jpg', mime: 'image/jpeg' },
            { name: 'cq5dam.thumbnail.319.319.png', ext: 'png', mime: 'image/png' },
          ];

    for (const c of candidates) {
      try {
        const buf = await requestBuffer(
          normAuthor,
          `/adobe/assets/${encodeURIComponent(asset.id)}/renditions/${c.name}/as/${seoName}.${c.ext}`
        );
        return { buffer: buf, ext: c.ext, mime: c.mime };
      } catch {
        // try next rendition candidate
      }
    }
    throw new Error(`No usable rendition found for ${asset.id}`);
  }

  /**
   * Upload the finished PDF into AEM Author, patch its metadata (including `xmp:CreatorTool`),
   * and verify the uploaded asset exists with a follow-up metadata GET (§7.4 steps 5–6).
   */
  async function uploadPdfAndVerify({
    folderPath = '/content/dam/contact-sheets',
    fileName,
    pdfBuffer,
    title,
    sourceLabel,
    assetCount,
    createdBy,
  }) {
    const cleanFolder =
      (folderPath || '/content/dam/contact-sheets')
        .replace(/\/+$/, '')
        .replace(/\/[^/]+\.pdf$/i, '') || '/content/dam/contact-sheets';
    // 1. Ensure folder exists (ignore 409 if already exists) and inspect existing asset names for sequence deduplication
    try {
      await requestJson(normAuthor, '/adobe/experimental/metaall-expires-20991231/folders', {
        method: 'POST',
        body: [{ path: cleanFolder, title: cleanFolder.split('/').pop() }],
      });
    } catch (err) {
      if (err.status !== 409) {
        // Continue to initiateUpload which will surface permission errors clearly
      }
    }

    const existingNames = [];
    let resolvedFileName = fileName;
    try {
      const folderListing = await listFolder({ path: cleanFolder, types: 'ASSET', limit: 50 });
      for (const c of folderListing?.children || []) {
        if (c.type === 'ASSET' && c.name) existingNames.push(c.name);
      }
      resolvedFileName = resolveUniqueFileName(fileName, existingNames);
    } catch {
      resolvedFileName = fileName;
    }

    // 2. Initiate upload: in AEM OpenAPI, `path` is the parent folder path and `fileName` is the asset name.
    // If `initiateUpload` reports a conflict (`errors: [{ type: ".../conflict" }]`) because a file with `resolvedFileName`
    // already exists, automatically increment the sequence suffix (`-1`, `-2`, `-3`, ...) and retry!
    let initRes = null;
    let uploadInfo = null;
    for (let seqAttempt = 0; seqAttempt < 25; seqAttempt++) {
      try {
        initRes = await requestJson(normAuthor, '/adobe/assets', {
          method: 'POST',
          body: {
            assets: [
              {
                path: cleanFolder,
                fileName: resolvedFileName,
                fileSize: pdfBuffer.byteLength,
              },
            ],
          },
        });
      } catch (initErr) {
        if (initErr.status === 409) {
          existingNames.push(resolvedFileName);
          resolvedFileName = resolveUniqueFileName(fileName, existingNames);
          continue;
        }
        throw initErr;
      }

      const valuesObj = initRes?.data?.values || initRes?.data || initRes;
      uploadInfo =
        (Array.isArray(valuesObj?.assets) && valuesObj.assets[0]) ||
        (Array.isArray(valuesObj?.uploads) && valuesObj.uploads[0]) ||
        (Array.isArray(valuesObj) && valuesObj[0]) ||
        (Array.isArray(initRes?.assets) && initRes.assets[0]) ||
        null;

      const hasConflictError =
        Array.isArray(initRes?.errors) &&
        initRes.errors.some((e) => /conflict|already exists/i.test(`${e?.type || ''} ${e?.title || ''} ${e?.detail || ''}`));

      if (!uploadInfo && hasConflictError) {
        existingNames.push(resolvedFileName);
        resolvedFileName = resolveUniqueFileName(fileName, existingNames);
        continue;
      }
      break;
    }

    const fullPath = `${cleanFolder}/${resolvedFileName}`;
    const assetId = uploadInfo?.id || uploadInfo?.assetId;
    const uploadToken = uploadInfo?.uploadToken;
    const uploadURIs = uploadInfo?.uploadURIs || [];
    const minPartSize = Number(uploadInfo?.minPartSize) || 10 * 1024 * 1024;
    const maxPartSize = Number(uploadInfo?.maxPartSize) || pdfBuffer.byteLength;
    if (!assetId || !uploadToken || !uploadURIs.length) {
      throw new Error(`AEM initiateUpload response: ${JSON.stringify(initRes)}`);
    }

    // 3. PUT binary to pre-signed URI(s) (supports single-part and multi-part uploadURIs)
    if (uploadURIs.length === 1) {
      const putRes = await fetchImpl(uploadURIs[0], {
        method: 'PUT',
        headers: { 'content-type': 'application/pdf' },
        body: pdfBuffer,
      });
      if (!putRes.ok) {
        throw new Error(`Failed uploading binary to pre-signed URL (${putRes.status})`);
      }
    } else {
      const partSize = Math.max(minPartSize, Math.min(maxPartSize, Math.ceil(pdfBuffer.byteLength / uploadURIs.length)));
      for (let i = 0; i < uploadURIs.length; i++) {
        const start = i * partSize;
        if (start >= pdfBuffer.byteLength) break;
        const end = Math.min(pdfBuffer.byteLength, start + partSize);
        const slice = pdfBuffer.subarray(start, end);
        const putRes = await fetchImpl(uploadURIs[i], {
          method: 'PUT',
          headers: { 'content-type': 'application/pdf' },
          body: slice,
        });
        if (!putRes.ok) {
          throw new Error(`Failed uploading part ${i + 1} to pre-signed URL (${putRes.status})`);
        }
      }
    }

    // 4. Complete upload (if 409 Conflict occurs because asset already exists, treat as existing or versioned)
    try {
      await requestJson(normAuthor, `/adobe/assets/${encodeURIComponent(assetId)}/completeUpload`, {
        method: 'POST',
        body: {
          uploadToken,
          createVersion: true,
          versionLabel: '1.0',
          versionComment: 'Generated by AEM Contact Sheet',
        },
      });
    } catch (completeErr) {
      if (completeErr.status !== 409) {
        throw completeErr;
      }
    }

    // 5. Patch descriptive metadata + CreatorTool marker so future sheets skip this PDF
    try {
      await requestJson(normAuthor, `/adobe/assets/${encodeURIComponent(assetId)}/metadata`, {
        method: 'PATCH',
        body: [
          { op: 'add', path: '/dc:title', value: title },
          { op: 'add', path: '/dc:description', value: `Contact sheet of ${assetCount} assets from ${sourceLabel}` },
          { op: 'add', path: '/dc:source', value: sourceLabel },
          { op: 'add', path: '/dc:creator', value: [createdBy || 'AEM Contact Sheet'] },
          { op: 'add', path: '/xmp:CreatorTool', value: CONTACT_SHEET_CREATOR_TOOL },
        ],
      });
    } catch {
      // Metadata patch is best-effort; verification below is authoritative
    }

    // 6. Verify asset exists and fetch a signed AEM download URL immediately
    // First try `/adobe/assets/{assetId}/original/as/{fileName}` with `redirect: 'manual'` — this returns
    // the 302 Location pre-signed blob URL immediately after `completeUpload` without waiting ~60s for
    // AEM's Smart Tagging / Asset Microservices (`aem:assetState === 'processed'`) and search indexing!
    const verified = await requestJson(normAuthor, `/adobe/assets/${encodeURIComponent(assetId)}/metadata`);
    let aemDownloadUrl = null;
    try {
      const origRes = await fetchImpl(
        `${normAuthor}/adobe/assets/${encodeURIComponent(assetId)}/original/as/${encodeURIComponent(resolvedFileName)}`,
        {
          method: 'GET',
          redirect: 'manual',
          headers: buildHeaders(),
        }
      );
      const loc = origRes?.headers?.get?.('location') || '';
      if (loc && loc.startsWith('https://')) {
        aemDownloadUrl = loc;
      }
    } catch {
      // Fall through to search-assets
    }
    if (!aemDownloadUrl) {
      try {
        const sRes = await requestJson(
          normAuthor,
          '/adobe/experimental/aemmcpserver-expires-20991231/search-assets',
          {
            method: 'POST',
            body: {
              termFilters: [{ key: 'repositoryMetadata.repo:name', value: resolvedFileName }],
              limit: 5,
            },
          }
        );
        const match = (sRes?.results || []).find((x) => x.assetId === assetId) || sRes?.results?.[0];
        aemDownloadUrl = match?.downloadUrl || null;
      } catch {
        // optional
      }
    }

    return {
      assetId,
      path: verified?.repositoryMetadata?.['repo:path'] || fullPath,
      fileName: resolvedFileName,
      size: verified?.repositoryMetadata?.['repo:size'] || pdfBuffer.byteLength,
      downloadUrl: aemDownloadUrl,
    };
  }

  /**
   * Look up custom tenant metadata field labels (e.g. `xdm:vehicleClass` -> `Vehicle Class`)
   * from AEM's metadata resolver / schema definitions.
   */
  async function fetchTenantMetadataFields(fieldKeys = []) {
    if (!fieldKeys.length) return [];
    try {
      const res = await requestJson(
        normAuthor,
        '/adobe/experimental/aemmcpserver-expires-20991231/resolve-asset-metadata',
        {
          method: 'POST',
          body: { query: fieldKeys.slice(0, 30).join(' ') },
        }
      );
      const fields = res?.fields || res?.metadataFields || res?.tenantFields || [];
      return fields
        .map((f) => ({
          key: f.property || f.name || f.key || f.fieldName,
          label: f.label || f.title || f.displayName,
          type: f.type,
        }))
        .filter((f) => f.key && f.label);
    } catch {
      return [];
    }
  }

  return {
    listFolder,
    resolveFolderAssets,
    resolveCollectionAssets,
    resolveSelectionAssets,
    fetchAssetThumbnailBuffer,
    uploadPdfAndVerify,
    fetchTenantMetadataFields,
  };
}
