// Convert raw AEM Author/Delivery asset records into a normalized SheetModel.

import {
  CONTACT_SHEET_CREATOR_TOOL,
  deriveOrientation,
  discoverFields,
  normalizeRawValue,
} from './fields.js';

export function isPreviousContactSheet(rawAsset) {
  const creatorTool = rawAsset?.assetMetadata?.['xmp:CreatorTool'];
  return creatorTool === CONTACT_SHEET_CREATOR_TOOL;
}

export function normalizeAsset(raw, index = 0) {
  const repo = raw.repositoryMetadata || {};
  const meta = raw.assetMetadata || {};
  const id = raw.assetId || raw.id || repo['repo:id'] || `asset-${index}`;
  const name = repo['repo:name'] || raw.name || id;
  const path = repo['repo:path'] || raw.path || '';
  const lastSlash = path.lastIndexOf('/');
  const folderPath = lastSlash > 0 ? path.slice(0, lastSlash) : '/';
  const folderName = folderPath === '/' ? '/' : folderPath.slice(folderPath.lastIndexOf('/') + 1);
  const format = repo['dc:format'] || raw.format || '';
  const size = Number(repo['repo:size'] ?? raw.size ?? 0);
  const width = Number(repo['tiff:imageWidth'] ?? meta['tiff:ImageWidth'] ?? 0) || undefined;
  const height = Number(repo['tiff:imageLength'] ?? meta['tiff:ImageLength'] ?? 0) || undefined;
  const created = repo['repo:createDate'] || meta['xmp:CreateDate'] || undefined;
  const modified = repo['repo:modifyDate'] || raw.lastModifiedAt || undefined;
  const createdBy = repo['repo:createdBy'] || undefined;
  const published = Boolean(repo['aem:published']);
  const damStatus = meta['dam:assetStatus'];
  const approved = damStatus === 'approved' && (published || (repo['repo:repositoryId'] || '').startsWith('delivery-'));

  const dcTitle = normalizeRawValue(meta['dc:title'], 'dc:title');
  const autogenTitle = normalizeRawValue(meta['autogen:title'], 'autogen:title');
  const baseName = name.replace(/\.[^.]+$/, '');
  const title = (Array.isArray(dcTitle) ? dcTitle[0] : dcTitle)
    || (Array.isArray(autogenTitle) ? autogenTitle[0] : autogenTitle)
    || baseName;

  const values = {
    'common:sourceOrder': index + 1,
    'repo:name': name,
    'common:title': title,
    'repo:createDate': created || null,
    'repo:modifyDate': modified || null,
    'dc:format': format || null,
    'repo:size': Number.isFinite(size) && size > 0 ? size : null,
    'common:dimensions': width && height ? { width, height } : null,
    'tiff:imageWidth': width ?? null,
    'tiff:imageLength': height ?? null,
    'common:orientation': deriveOrientation(width, height),
    'common:folder': folderName || folderPath || null,
    'repo:createdBy': createdBy || null,
  };

  for (const [k, rawVal] of Object.entries(meta)) {
    const norm = normalizeRawValue(rawVal, k);
    if (norm !== null) {
      values[k] = norm;
    }
  }

  return {
    id,
    name,
    path,
    folderPath,
    format,
    size,
    width,
    height,
    created,
    modified,
    createdBy,
    published,
    approved,
    status: damStatus ? String(damStatus).toLowerCase() : undefined,
    thumbnailUrl: raw.thumbnailUrl || undefined,
    downloadUrl: raw.downloadUrl || undefined,
    values,
  };
}

/**
 * Build a verified deep-link URL to open an asset's detail page in AEM Assets View (`tier=author`)
 * or AEM Content Hub (`tier=delivery`).
 */
export function buildAssetDeepLink(asset, model = null) {
  const tier = model?.tier || 'author';
  if (tier === 'delivery') {
    const repoHost = (model?.deliveryHost || 'https://delivery-p59602-e520244.adobeaemcloud.com')
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    return `https://experience.adobe.com/?repoId=${encodeURIComponent(repoHost)}#/assets/contenthub/assets/${encodeURIComponent(asset?.id || '')}`;
  }
  const aemBase = (model?.aemHost || 'https://author-p59602-e520244.adobeaemcloud.com').replace(/\/+$/, '');
  if (asset?.path && asset.path.startsWith('/content/dam/')) {
    const encodedPath = asset.path
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `${aemBase}/ui#/aem/assets/detail${encodedPath}`;
  }
  return `${aemBase}/ui#/aem/assets/go?action=asset-details&id=${encodeURIComponent(asset?.id || '')}`;
}

/**
 * Build a complete SheetModel from raw AEM asset items.
 */
export function buildSheetModel({
  rawAssets = [],
  source = { kind: 'folder', id: '', path: '/content/dam', includeSubfolders: false },
  sourceLabel = '/content/dam',
  tier = 'author',
  aemHost = '',
  deliveryHost = '',
  resolvedBy = '',
  schemaFields = [],
  maxAssets = 500,
} = {}) {
  const warnings = [];
  const filtered = [];
  let skippedSheets = 0;

  for (const raw of rawAssets) {
    if (isPreviousContactSheet(raw)) {
      skippedSheets++;
      continue;
    }
    filtered.push(raw);
  }
  if (skippedSheets > 0) {
    warnings.push(`Excluded ${skippedSheets} previously generated contact sheet PDF(s).`);
  }

  const totalFound = filtered.length;
  const truncated = totalFound > maxAssets;
  const normalizedAll = filtered.map((raw, i) => normalizeAsset(raw, i));
  const fields = discoverFields(normalizedAll, schemaFields);

  return {
    modelVersion: 1,
    tier,
    aemHost,
    deliveryHost: deliveryHost || aemHost.replace(/^https:\/\/author-/, 'https://delivery-'),
    source,
    sourceLabel,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
    totalFound,
    truncated,
    maxAssets,
    fields,
    assets: normalizedAll,
    warnings,
  };
}
