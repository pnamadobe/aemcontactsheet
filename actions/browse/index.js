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

    if (mode === 'createFolder') {
      const newPath = (params.newFolderPath || '').trim();
      if (!newPath.startsWith('/content/dam/')) {
        return errorResponse(400, 'INVALID_FOLDER_PATH', 'Folder path must start with /content/dam/.');
      }
      const res = await fetch(`${aemHost.replace(/\/+$/, '')}/adobe/experimental/metaall-expires-20991231/folders`, {
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
        path: f.path,
      }));

    const images = mode === 'images'
      ? children
          .filter((c) => c.type === 'ASSET' && /\.(png|jpe?g|svg|webp)$/i.test(c.name || ''))
          .map((a) => ({
            assetId: a.assetId || a.id,
            name: a.name,
            path: `${folderPath.replace(/\/+$/, '')}/${a.name}`,
            size: a.size,
          }))
      : [];

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
