// GET / PUT user preferences (`lastOutputFolder`, `lastLogo`) at `prefs/{orgId}/{userHash}.json` (§5, §7.5, §7.6).
import { errorResponse, extractAuth, jsonResponse } from '../lib/utils.js';
import { readFileObject, writeFileObject } from '../lib/store.js';

const DEFAULT_PREFS = {
  lastOutputFolder: { id: '', path: '/content/dam/contact-sheets' },
  lastLogo: null,
};

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const fileKey = `prefs/${auth.imsOrg}/${auth.userHash}.json`;
    const raw = await readFileObject(fileKey, true);
    const parsed = raw ? JSON.parse(raw) : {};
    const current = {
      lastOutputFolder: parsed.lastOutputFolder ?? DEFAULT_PREFS.lastOutputFolder,
      lastLogo: parsed.lastLogo ?? DEFAULT_PREFS.lastLogo,
      ...(parsed.updatedAt ? { updatedAt: parsed.updatedAt } : {}),
    };
    const method = (params.__ow_method || params.method || 'GET').toUpperCase();

    if (method === 'GET') {
      return jsonResponse(200, current);
    }

    if (method === 'PUT' || method === 'POST') {
      const updated = {
        ...parsed,
        ...current,
        ...(params.lastOutputFolder !== undefined ? { lastOutputFolder: params.lastOutputFolder } : {}),
        ...(params.lastLogo !== undefined ? { lastLogo: params.lastLogo } : {}),
        updatedAt: new Date().toISOString(),
      };
      await writeFileObject(fileKey, JSON.stringify(updated, null, 2));
      return jsonResponse(200, {
        lastOutputFolder: updated.lastOutputFolder,
        lastLogo: updated.lastLogo,
        updatedAt: updated.updatedAt,
      });
    }

    return errorResponse(405, 'METHOD_NOT_ALLOWED', `Unsupported method ${method}`);
  } catch (err) {
    return errorResponse(500, 'PREFS_FAILED', err.message || 'Failed managing user preferences');
  }
}
