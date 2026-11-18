// Convert raw AEM Author/Delivery asset records into a normalized SheetModel.

import {
  CONTACT_SHEET_CREATOR_TOOL,
  deriveOrientation,
  discoverFields,
  normalizeRawValue,
} from './fields.js';

export function isPreviousContactSheet(rawAsset) {
  const creatorTool = rawAsset?.assetMetadata?.['xmp:CreatorTool'];
  if (creatorTool === CONTACT_SHEET_CREATOR_TOOL) return true;
  const name = String(rawAsset?.repositoryMetadata?.['repo:name'] || rawAsset?.name || '');
  return /^contact-sheet[_-]\d{4}-\d{2}-\d{2}.*\.pdf$/i.test(name);
}

const IGNORED_EXTENSIONS = new Set([
  // Spreadsheets, data feeds, logs & configs
  'csv',
  'tsv',
  'json',
  'txt',
  'log',
  'xml',
  'yaml',
  'yml',
  'md',
  'ini',
  'cfg',
  'conf',
  'properties',
  'lst',
  'xmp',
  // Archives & ad-server packages (e.g. CM360 HTML5 banner ZIPs)
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  '7z',
  'rar',
  // Font binaries
  'ttf',
  'otf',
  'ttc',
  'woff',
  'woff2',
  'eot',
  'dfont',
  // Web code & scripts
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'ts',
  'jsx',
  'tsx',
  'sh',
  'py',
  // Audio-only files
  'mp3',
  'wav',
  'aac',
  'flac',
  'ogg',
  'm4a',
  'wma',
  'aiff',
  // Office documents & spreadsheets
  'xls',
  'xlsx',
  'doc',
  'docx',
  // Project / sidecar files without static DAM renditions
  'aep',
  'prproj',
  'sesx',
  'aae',
  'ds_store',
]);

const IGNORED_MIME_PREFIXES = ['text/', 'audio/', 'font/'];

const IGNORED_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/vnd.adobecloud.template+json',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/x-font-woff',
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.audiograph',
]);

/**
 * Returns true if the raw AEM asset is a non-visual/ancillary file type (e.g. CSV data feed,
 * JSON job manifest, log file, HTML5 banner ZIP archive, font binary, audio file, or DM template)
 * that should be excluded from visual contact sheets.
 */
export function isExcludedNonVisualAsset(rawAsset) {
  const repo = rawAsset?.repositoryMetadata || {};
  const meta = rawAsset?.assetMetadata || {};
  const name = String(repo['repo:name'] || rawAsset?.name || '').trim();
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith('.')) return true;

  const dotIdx = lowerName.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < lowerName.length - 1) {
    const ext = lowerName.slice(dotIdx + 1);
    if (IGNORED_EXTENSIONS.has(ext)) return true;
  }

  const fmt = String(meta['dc:format'] || repo['dc:format'] || rawAsset?.format || '')
    .trim()
    .toLowerCase();
  if (fmt) {
    if (IGNORED_MIME_TYPES.has(fmt)) return true;
    if (IGNORED_MIME_PREFIXES.some((prefix) => fmt.startsWith(prefix))) return true;
  }

  return false;
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
 * Build a verified deep-link URL on `https://experience.adobe.com` to open an asset's detail page
 * in AEM Assets View (`tier=author`) or AEM Content Hub (`tier=delivery`).
 */
export function buildAssetDeepLink(asset, model = null) {
  const tier = model?.tier || 'author';
  const orgPrefix = model?.imsOrgSubdomain ? `/@${String(model.imsOrgSubdomain).toLowerCase().replace(/^@/, '')}` : '';
  if (tier === 'delivery') {
    const repoHost = (model?.deliveryHost || '')
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    const repoQuery = repoHost ? `?repoId=${encodeURIComponent(repoHost)}` : '';
    return `https://experience.adobe.com/${repoQuery}#${orgPrefix}/assets/contenthub/assets/${encodeURIComponent(asset?.id || '')}`;
  }
  const authorRepoHost = (model?.aemHost || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const repoQuery = authorRepoHost ? `?repoId=${encodeURIComponent(authorRepoHost)}` : '';
  if (asset?.path && asset.path.startsWith('/content/dam/')) {
    const encodedPath = asset.path
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `https://experience.adobe.com/${repoQuery}#${orgPrefix}/assets/detail${encodedPath}`;
  }
  return `https://experience.adobe.com/${repoQuery}#${orgPrefix}/assets/go?action=asset-details&id=${encodeURIComponent(asset?.id || '')}`;
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
  let skippedNonVisual = 0;

  for (const raw of rawAssets) {
    if (isPreviousContactSheet(raw)) {
      skippedSheets++;
      continue;
    }
    if (isExcludedNonVisualAsset(raw)) {
      skippedNonVisual++;
      continue;
    }
    filtered.push(raw);
  }
  if (skippedSheets > 0) {
    warnings.push(`Excluded ${skippedSheets} previously generated contact sheet PDF(s).`);
  }
  if (skippedNonVisual > 0) {
    warnings.push(`Excluded ${skippedNonVisual} non-visual file(s) (CSV, JSON, TXT, ZIP, fonts, audio).`);
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
