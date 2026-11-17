// GET / PUT / DELETE personal presets in App Builder Files at `presets/{orgId}/{userHash}.json`.
import { errorResponse, extractAuth, jsonResponse } from '../lib/utils.js';
import { readFileObject, writeFileObject } from '../lib/store.js';

const DEFAULT_WATERMARK_PRESETS = [
  {
    id: 'wm_confidential_center',
    name: 'CONFIDENTIAL (45° Center)',
    watermark: {
      enabled: true,
      text: 'CONFIDENTIAL',
      font: 'blocky',
      fontAssetId: null,
      fontPath: null,
      fontName: null,
      angle: 45,
      position: 'center',
      opacity: 35,
      coverage: 60,
    },
  },
  {
    id: 'wm_fpo_diagonal',
    name: 'FPO — DO NOT DISTRIBUTE',
    watermark: {
      enabled: true,
      text: 'FPO — DO NOT DISTRIBUTE',
      font: 'blocky',
      fontAssetId: null,
      fontPath: null,
      fontName: null,
      angle: 45,
      position: 'center',
      opacity: 40,
      coverage: 75,
    },
  },
  {
    id: 'wm_draft_corner',
    name: 'DRAFT (Bottom Right)',
    watermark: {
      enabled: true,
      text: 'DRAFT',
      font: 'blocky',
      fontAssetId: null,
      fontPath: null,
      fontName: null,
      angle: 0,
      position: 'bottom-right',
      opacity: 45,
      coverage: 45,
    },
  },
];

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const fileKey = `presets/${auth.imsOrg}/${auth.userHash}.json`;
    const raw = await readFileObject(fileKey, true);
    const parsed = raw ? JSON.parse(raw) : {};
    const store = {
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      watermarkPresets:
        Array.isArray(parsed.watermarkPresets) && parsed.watermarkPresets.length > 0
          ? parsed.watermarkPresets
          : [...DEFAULT_WATERMARK_PRESETS],
    };
    const method = (params.__ow_method || params.method || 'GET').toUpperCase();

    if (method === 'GET') {
      return jsonResponse(200, store);
    }

    if (method === 'PUT' || method === 'POST') {
      // Save a standalone Watermark Preset
      if (params.watermarkPreset) {
        const wp = params.watermarkPreset;
        if (!wp.name || !wp.watermark) {
          return errorResponse(400, 'INVALID_WATERMARK_PRESET', 'watermarkPreset must include name and watermark.');
        }
        const id = wp.id || `wmp_${Date.now().toString(36)}`;
        const entry = {
          id,
          name: String(wp.name).trim(),
          updatedAt: new Date().toISOString(),
          watermark: wp.watermark,
        };
        const existingIdx = store.watermarkPresets.findIndex((p) => p.id === id || p.name === entry.name);
        if (existingIdx >= 0) {
          store.watermarkPresets[existingIdx] = entry;
        } else {
          store.watermarkPresets.push(entry);
        }
        await writeFileObject(fileKey, JSON.stringify(store, null, 2));
        return jsonResponse(200, {
          watermarkPreset: entry,
          watermarkPresets: store.watermarkPresets,
          presets: store.presets,
        });
      }

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
      return jsonResponse(200, {
        preset: entry,
        presets: store.presets,
        watermarkPresets: store.watermarkPresets,
      });
    }

    if (method === 'DELETE') {
      if (params.watermarkPresetId) {
        store.watermarkPresets = store.watermarkPresets.filter((p) => p.id !== params.watermarkPresetId);
      } else {
        const id = params.id;
        store.presets = store.presets.filter((p) => p.id !== id);
      }
      await writeFileObject(fileKey, JSON.stringify(store, null, 2));
      return jsonResponse(200, {
        presets: store.presets,
        watermarkPresets: store.watermarkPresets,
      });
    }

    return errorResponse(405, 'METHOD_NOT_ALLOWED', `Unsupported method ${method}`);
  } catch (err) {
    return errorResponse(500, 'PRESETS_FAILED', err.message || 'Failed managing presets');
  }
}
