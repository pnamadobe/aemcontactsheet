// GET /browse — lightweight folder browser and logo image picker (S10).
// Supports listing subfolders, creating a new destination folder, and listing image assets for the header logo picker.
import { errorResponse, extractAuth, jsonResponse } from '../lib/utils.js';
import { createAemClient } from '../lib/aem.js';

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const aemHost = params.aemHost || params.DEFAULT_AEM_HOST || 'https://author-p59602-e520244.adobeaemcloud.com';
    const deliveryHost = params.deliveryHost || params.DEFAULT_DELIVERY_HOST || 'https://delivery-p59602-e520244.adobeaemcloud.com';
    const aem = createAemClient({
      aemHost,
      deliveryHost,
      bearerToken: auth.bearerToken,
      imsOrg: auth.imsOrg,
      apiKey: auth.apiKey,
    });

    const mode = params.mode || 'folders'; // 'folders' | 'images' | 'createFolder'
    const folderPath = params.path || '/content/dam';
    const normAuthor = aemHost.replace(/\/+$/, '');

    if (mode === 'createFolder') {
      const newPath = (params.newFolderPath || '').trim();
      if (!newPath.startsWith('/content/dam/')) {
        return errorResponse(400, 'INVALID_FOLDER_PATH', 'Folder path must start with /content/dam/.');
      }
      const res = await fetch(`${normAuthor}/adobe/experimental/metaall-expires-20991231/folders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.bearerToken}`,
          'x-api-key': auth.apiKey,
          'x-gw-ims-org-id': auth.imsOrg,
          'X-Adobe-Accept-Experimental': '1',
          'content-type': 'application/json',
        },
        body: JSON.stringify([{ path: newPath, title: params.title || newPath.split('/').pop() }]),
      });
      if (!res.ok && res.status !== 409) {
        return errorResponse(res.status, 'CREATE_FOLDER_FAILED', `Could not create folder ${newPath} (${res.status})`);
      }
      return jsonResponse(200, { path: newPath, created: true });
    }

    async function fetchSmallThumbDataUrl(assetId) {
      for (const rName of [
        { name: 'cq5dam.thumbnail.319.319.png', mime: 'image/png' },
        { name: 'cq5dam.thumbnail.140.100.png', mime: 'image/png' },
        { name: 'cq5dam.fpo.jpeg', mime: 'image/jpeg' },
        { name: 'cq5dam.thumbnail.48.48.png', mime: 'image/png' },
      ]) {
        try {
          const rRes = await fetch(
            `${normAuthor}/adobe/assets/${encodeURIComponent(assetId)}/renditions/${rName.name}/as/thumb`,
            {
              headers: {
                Authorization: `Bearer ${auth.bearerToken}`,
                'x-api-key': auth.apiKey,
                'x-gw-ims-org-id': auth.imsOrg,
              },
            }
          );
          if (rRes.ok) {
            const ab = await rRes.arrayBuffer();
            const buf = Buffer.from(ab);
            if (buf.byteLength > 64) {
              return `data:${rName.mime};base64,${buf.toString('base64')}`;
            }
          }
        } catch {
          // try next rendition
        }
      }
      return null;
    }

    // Batch thumbnail resolver (`GET /browse?mode=thumbnails&assetIds=urn:...,urn:...`) for unapproved/rejected Author assets in Live Preview
    if (mode === 'thumbnails') {
      const ids = String(params.assetIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 15);
      const thumbnails = {};
      await Promise.all(
        ids.map(async (id) => {
          const dataUrl = await fetchSmallThumbDataUrl(id);
          if (dataUrl) thumbnails[id] = dataUrl;
        })
      );
      return jsonResponse(200, { thumbnails });
    }

    // Discover published/uploaded font files (`.ttf`, `.otf`, `.woff`, `.woff2`) from `/content/dam/fonts` AND across DAM
    if (mode === 'fonts') {
      const byName = new Map();
      function humanizeFontName(fileName = '') {
        return String(fileName)
          .replace(/\.(ttf|otf|woff2?)$/i, '')
          .replace(/-VariableFont.*$/i, '')
          .replace(/[_-]+/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // 1. Check `/content/dam/fonts` (primary convention)
      try {
        const fontFolder = await aem.listFolder({
          path: '/content/dam/fonts',
          types: 'ASSET',
          limit: 50,
        });
        for (const c of fontFolder?.children || []) {
          if (c.type === 'ASSET' && /\.(ttf|otf|woff2?)$/i.test(c.name || '')) {
            const key = c.name.toLowerCase();
            byName.set(key, {
              assetId: c.assetId || c.id,
              name: c.name,
              label: humanizeFontName(c.name),
              path: `/content/dam/fonts/${c.name}`,
              folder: '/content/dam/fonts',
              primary: true,
            });
          }
        }
      } catch {
        // non-fatal if /content/dam/fonts does not exist in tenant
      }

      // 2. Also discover font files stored under any other DAM folder convention via `dc:format` search
      try {
        const sRes = await fetch(`${normAuthor}/adobe/experimental/metaall-expires-20991231/assets/search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.bearerToken}`,
            'x-api-key': auth.apiKey,
            'x-gw-ims-org-id': auth.imsOrg,
            'X-Adobe-Accept-Experimental': '1',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: [
              {
                term: {
                  'repositoryMetadata.dc:format': [
                    'font/ttf',
                    'font/otf',
                    'font/woff',
                    'font/woff2',
                    'application/x-font-ttf',
                    'application/x-font-otf',
                  ],
                },
              },
            ],
            limit: 60,
          }),
        });
        if (sRes.ok) {
          const sJson = await sRes.json().catch(() => ({}));
          for (const h of sJson?.hits?.results || []) {
            const name = h?.repositoryMetadata?.['repo:name'] || '';
            const fullPath = h?.repositoryMetadata?.['repo:path'] || '';
            if (!/\.(ttf|otf|woff2?)$/i.test(name)) continue;
            const key = name.toLowerCase();
            if (!byName.has(key)) {
              const slash = fullPath.lastIndexOf('/');
              const folder = slash > 0 ? fullPath.slice(0, slash) : '/content/dam';
              byName.set(key, {
                assetId: h.assetId,
                name,
                label: humanizeFontName(name),
                path: fullPath,
                folder,
                primary: folder === '/content/dam/fonts',
              });
            }
          }
        }
      } catch {
        // non-fatal
      }

      const fonts = [...byName.values()].sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      return jsonResponse(200, { fonts });
    }

    // Fetch a DAM font binary as a `data:` URL (`GET /browse?mode=fontData&assetId=urn:...&name=ArchivoBlack-Regular.ttf`)
    if (mode === 'fontData' && params.assetId) {
      const fontName = String(params.name || 'font.ttf');
      const buf = await aem.fetchAssetOriginalBuffer(params.assetId, fontName);
      const ext = fontName.split('.').pop()?.toLowerCase() || 'ttf';
      const mime =
        ext === 'otf'
          ? 'font/otf'
          : ext === 'woff2'
            ? 'font/woff2'
            : ext === 'woff'
              ? 'font/woff'
              : 'font/ttf';
      return jsonResponse(200, {
        assetId: params.assetId,
        name: fontName,
        fontDataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      });
    }

    // Optional search query for finding logo images quickly across DAM
    if (mode === 'images' && params.q && String(params.q).trim()) {
      const qStr = String(params.q).trim();
      const sRes = await fetch(`${normAuthor}/adobe/experimental/aemmcpserver-expires-20991231/search-assets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.bearerToken}`,
          'x-api-key': auth.apiKey,
          'x-gw-ims-org-id': auth.imsOrg,
          'X-Adobe-Accept-Experimental': '1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: qStr,
          limit: 10,
        }),
      });
      const sJson = sRes.ok ? await sRes.json().catch(() => ({})) : {};
      let images = (sJson?.results || [])
        .filter((r) => /\.(png|jpe?g|svg|webp)$/i.test(r?.repositoryMetadata?.['repo:name'] || ''))
        .map((r) => ({
          assetId: r.assetId,
          name: r.repositoryMetadata?.['repo:name'] || r.assetId,
          path: r.repositoryMetadata?.['repo:path'] || '',
          size: r.repositoryMetadata?.['repo:size'] || 0,
          thumbnailUrl: r.thumbnailUrl || null,
          downloadUrl: r.downloadUrl || null,
        }));
      images = await Promise.all(
        images.map(async (img) => {
          const dataUrl = await fetchSmallThumbDataUrl(img.assetId);
          return {
            ...img,
            thumbnailUrl: dataUrl || img.thumbnailUrl,
            downloadUrl: dataUrl || img.downloadUrl || img.thumbnailUrl,
          };
        })
      );
      return jsonResponse(200, {
        self: { path: folderPath },
        folders: [],
        images,
        cursor: null,
      });
    }

    const types = mode === 'images' ? 'FOLDER,ASSET' : 'FOLDER';
    const listing = await aem.listFolder({
      path: folderPath,
      types,
      limit: 50,
      cursor: params.cursor || null,
    });

    const children = listing?.children || [];
    const folders = children
      .filter((c) => c.type === 'FOLDER')
      .map((f) => ({
        id: f.folderId || f.id,
        name: f.name,
        title: f.title || f.name,
        path: f.path || `${folderPath.replace(/\/+$/, '')}/${f.name}`,
      }));

    let images = mode === 'images'
      ? children
          .filter((c) => c.type === 'ASSET' && /\.(png|jpe?g|svg|webp)$/i.test(c.name || ''))
          .map((a) => ({
            assetId: a.assetId || a.id,
            name: a.name,
            path: `${folderPath.replace(/\/+$/, '')}/${a.name}`,
            size: a.size,
            thumbnailUrl: null,
            downloadUrl: null,
          }))
      : [];

    // Enrich logo images in this folder with AEM's pre-generated small thumbnail (`cq5dam.thumbnail.140.100.png` / `48.48.png`)
    // as a self-contained data URL so both the Logo Picker list and the Live Preview iframe render it immediately with zero CORS issues!
    if (images.length > 0) {
      try {
        const sRes = await fetch(`${normAuthor}/adobe/experimental/aemmcpserver-expires-20991231/search-assets`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.bearerToken}`,
            'x-api-key': auth.apiKey,
            'x-gw-ims-org-id': auth.imsOrg,
            'X-Adobe-Accept-Experimental': '1',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            termFilters: [{ key: 'repositoryMetadata.repo:ancestors', value: folderPath }],
            limit: 10,
          }),
        });
        if (sRes.ok) {
          const sJson = await sRes.json().catch(() => ({}));
          const byId = new Map((sJson?.results || []).map((x) => [x.assetId, x]));
          images = images.map((img) => {
            const m = byId.get(img.assetId);
            return m
              ? { ...img, thumbnailUrl: m.thumbnailUrl || null, downloadUrl: m.downloadUrl || null }
              : img;
          });
        }
      } catch {
        // non-fatal
      }

      images = await Promise.all(
        images.slice(0, 20).map(async (img) => {
          const dataUrl = await fetchSmallThumbDataUrl(img.assetId);
          return {
            ...img,
            thumbnailUrl: dataUrl || img.thumbnailUrl,
            downloadUrl: dataUrl || img.downloadUrl || img.thumbnailUrl,
          };
        })
      );
    }

    return jsonResponse(200, {
      self: listing?.self || { path: folderPath },
      folders,
      images,
      cursor: listing?.cursor || null,
    });
  } catch (err) {
    return errorResponse(err.status || 500, 'BROWSE_FAILED', err.message || 'Failed browsing AEM folder');
  }
}
