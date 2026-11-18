// Internal demo GET / PUT user preferences (`lastOutputFolder`, `lastLogo`, `savedBoardsProfiles`, `defaultBoardsProfileId`).
import { errorResponse, extractAuth, jsonResponse } from '../../../actions/lib/utils.js';
import { readFileObject, writeFileObject } from '../../../actions/lib/store.js';

const DEFAULT_PREFS = {
  lastOutputFolder: { id: '', path: '/content/dam/contact-sheets' },
  lastLogo: null,
  savedBoardsProfiles: [],
  defaultBoardsProfileId: null,
};

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const fileKey = `prefs/${auth.imsOrg}/${auth.userHash}.json`;
    const raw = await readFileObject(fileKey, true);
    const current = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
    const method = (params.__ow_method || params.method || 'GET').toUpperCase();

    if (method === 'GET') {
      if (Array.isArray(current.savedBoardsProfiles) && current.savedBoardsProfiles.length > 0 && !process.env.CONTACTSHEET_LOCAL_STORE) {
        current.savedBoardsProfiles = await Promise.all(
          current.savedBoardsProfiles.map(async (p) => {
            if (!p?.token) return { ...p, tokenExpired: true };
            try {
              const r = await fetch('https://ims-na1.adobelogin.com/ims/profile/v1', {
                headers: { Authorization: `Bearer ${p.token}` },
              });
              return { ...p, tokenExpired: r.status === 401 || r.status === 403 };
            } catch {
              return p;
            }
          })
        );
      }
      return jsonResponse(200, current);
    }

    if (method === 'PUT' || method === 'POST') {
      const updated = {
        ...current,
        ...(params.lastOutputFolder !== undefined ? { lastOutputFolder: params.lastOutputFolder } : {}),
        ...(params.lastLogo !== undefined ? { lastLogo: params.lastLogo } : {}),
        ...(params.savedBoardsProfiles !== undefined ? { savedBoardsProfiles: params.savedBoardsProfiles } : {}),
        ...(params.defaultBoardsProfileId !== undefined ? { defaultBoardsProfileId: params.defaultBoardsProfileId } : {}),
        updatedAt: new Date().toISOString(),
      };
      await writeFileObject(fileKey, JSON.stringify(updated, null, 2));
      return jsonResponse(200, updated);
    }

    return errorResponse(405, 'METHOD_NOT_ALLOWED', `Unsupported method ${method}`);
  } catch (err) {
    return errorResponse(500, 'PREFS_FAILED', err.message || 'Failed managing user preferences');
  }
}
