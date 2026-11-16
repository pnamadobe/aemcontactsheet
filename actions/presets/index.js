// GET / PUT / DELETE personal presets in App Builder Files at `presets/{orgId}/{userHash}.json`.
import { errorResponse, extractAuth, jsonResponse } from '../lib/utils.js';
import { readFileObject, writeFileObject } from '../lib/store.js';

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const fileKey = `presets/${auth.imsOrg}/${auth.userHash}.json`;
    const raw = await readFileObject(fileKey, true);
    const store = raw ? JSON.parse(raw) : { presets: [] };
    const method = (params.__ow_method || params.method || 'GET').toUpperCase();

    if (method === 'GET') {
      return jsonResponse(200, store);
    }

    if (method === 'PUT' || method === 'POST') {
      const preset = params.preset;
      if (!preset || !preset.name || !preset.config) {
        return errorResponse(400, 'INVALID_PRESET', 'Preset must include name and config.');
      }
      const id = preset.id || `preset_${Date.now().toString(36)}`;
      const entry = {
        id,
        name: String(preset.name).trim(),
        isDefault: Boolean(preset.isDefault),
        updatedAt: new Date().toISOString(),
        config: preset.config,
      };
      if (entry.isDefault) {
        for (const p of store.presets) p.isDefault = false;
      }
      const existingIdx = store.presets.findIndex((p) => p.id === id || p.name === entry.name);
      if (existingIdx >= 0) {
        store.presets[existingIdx] = entry;
      } else {
        store.presets.push(entry);
      }
      await writeFileObject(fileKey, JSON.stringify(store, null, 2));
      return jsonResponse(200, { preset: entry, presets: store.presets });
    }

    if (method === 'DELETE') {
      const id = params.id;
      store.presets = store.presets.filter((p) => p.id !== id);
      await writeFileObject(fileKey, JSON.stringify(store, null, 2));
      return jsonResponse(200, { presets: store.presets });
    }

    return errorResponse(405, 'METHOD_NOT_ALLOWED', `Unsupported method ${method}`);
  } catch (err) {
    return errorResponse(500, 'PRESETS_FAILED', err.message || 'Failed managing presets');
  }
}
