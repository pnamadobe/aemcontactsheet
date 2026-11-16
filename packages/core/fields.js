// Field registry, metadata value extraction, type inference, coverage ranking, and display formatting.

export const CONTACT_SHEET_CREATOR_TOOL = 'AEM Contact Sheet';

/** Common fields always available for sorting, grouping, and printing. */
export const COMMON_FIELDS = [
  { key: 'common:sourceOrder', source: 'derived', label: 'Source order', type: 'number', common: true, groupable: false },
  { key: 'repo:name', source: 'repository', label: 'Filename', type: 'text', common: true, groupable: true },
  { key: 'common:title', source: 'derived', label: 'Title', type: 'text', common: true, groupable: false },
  { key: 'repo:createDate', source: 'repository', label: 'Date created', type: 'date', common: true, groupable: true },
  { key: 'repo:modifyDate', source: 'repository', label: 'Date modified', type: 'date', common: true, groupable: true },
  { key: 'dc:format', source: 'repository', label: 'File type', type: 'text', common: true, groupable: true },
  { key: 'repo:size', source: 'repository', label: 'File size', type: 'bytes', common: true, groupable: false },
  { key: 'common:dimensions', source: 'derived', label: 'Dimensions', type: 'dimensions', common: true, groupable: false },
  { key: 'tiff:imageWidth', source: 'repository', label: 'Width (px)', type: 'number', common: true, groupable: false },
  { key: 'tiff:imageLength', source: 'repository', label: 'Height (px)', type: 'number', common: true, groupable: false },
  { key: 'common:orientation', source: 'derived', label: 'Orientation', type: 'text', common: true, groupable: true },
  { key: 'common:folder', source: 'derived', label: 'Folder', type: 'text', common: true, groupable: true },
  { key: 'repo:createdBy', source: 'repository', label: 'Created by', type: 'text', common: true, groupable: true },
];

/** Curated metadata dictionary: friendly label, type, groupability, and priority boost when ranking. */
export const KNOWN_ASSET_FIELDS = {
  'dc:title': { label: 'Title (DC)', type: 'text', groupable: false, priority: 100 },
  'dc:description': { label: 'Description', type: 'text', groupable: false, priority: 95 },
  'dc:subject': { label: 'Keywords', type: 'list', groupable: true, priority: 85 },
  'dc:creator': { label: 'Creator / Photographer', type: 'list', groupable: true, priority: 90 },
  'dc:rights': { label: 'Copyright / Rights', type: 'text', groupable: true, priority: 80 },
  'xcm:keywords': { label: 'Tags', type: 'tags', groupable: true, priority: 88 },
  'dam:assetStatus': { label: 'Approval status', type: 'text', groupable: true, priority: 92 },
  'xdm:campaignName': { label: 'Campaign', type: 'text', groupable: true, priority: 89 },
  'product:brand': { label: 'Brand', type: 'text', groupable: true, priority: 87 },
  'product:team': { label: 'Team', type: 'text', groupable: true, priority: 86 },
  'product:appareltype': { label: 'Apparel type', type: 'text', groupable: true, priority: 85 },
  'product:sneakerBrand': { label: 'Sneaker brand', type: 'text', groupable: true, priority: 75 },
  'product:backgroundScene': { label: 'Background scene', type: 'text', groupable: true, priority: 70 },
  'photoshop:Credit': { label: 'Credit', type: 'text', groupable: true, priority: 60 },
  'xmpRights:Marked': { label: 'Rights managed', type: 'boolean', groupable: true, priority: 55 },
  'xmpRights:WebStatement': { label: 'Rights URL', type: 'text', groupable: false, priority: 50 },
  'autogen:title': { label: 'AI title', type: 'text', groupable: false, priority: 45 },
  'autogen:description': { label: 'AI description', type: 'text', groupable: false, priority: 40 },
  'autogen:subject': { label: 'AI keywords', type: 'list', groupable: true, priority: 35 },
  'xcm:machineKeywords': { label: 'Smart tags', type: 'tags', groupable: true, priority: 30 },
};

/** Technical / noisy metadata keys hidden from the top suggestions by default. */
const TECHNICAL_KEY_PATTERNS = [
  /^status$/i,
  /^tiff:/i,
  /^xmpMM:/i,
  /^xmpTPg:/i,
  /^exif:/i,
  /_xmpArrayType$/i,
  /^dm-/i,
  /^hasLocalCrops$/i,
  /^autogen:lastModified$/i,
  /^xcm:colorDistribution$/i,
  /^Iptc4xmpExt:/i,
  /^dam:Bitsperpixel$/i,
  /^dam:activationTarget$/i,
  /^dam:sha1$/i,
  /^fmUuid$/i,
  /^fmPostProcessedAt$/i,
  /^dxmlLastCreatedVersion$/i,
  /^illustrator:/i,
  /^pdf:Producer$/i,
  /^photoshop:ColorMode$/i,
  /^photoshop:ICCProfile$/i,
  /^lr:hierarchicalSubject/i,
];

export function isTechnicalField(key) {
  if (KNOWN_ASSET_FIELDS[key]) return false;
  return TECHNICAL_KEY_PATTERNS.some((re) => re.test(key));
}

/** Turn a raw property key like `product:appareltype` or `brand:sku_id` into a readable label. */
export function humanizeFieldKey(key) {
  if (KNOWN_ASSET_FIELDS[key]) return KNOWN_ASSET_FIELDS[key].label;
  const common = COMMON_FIELDS.find((f) => f.key === key);
  if (common) return common.label;
  const [ns, rawName] = key.includes(':') ? key.split(':', 2) : ['', key];
  const spaced = rawName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  const titled = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  if (ns && !['dc', 'dam', 'repo', 'common', 'xmp'].includes(ns.toLowerCase())) {
    const nsCap = ns.charAt(0).toUpperCase() + ns.slice(1);
    if (!titled.toLowerCase().startsWith(ns.toLowerCase())) {
      return `${nsCap}: ${titled}`;
    }
  }
  return titled;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function isEmptyValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0 || val.every(isEmptyValue);
  if (typeof val === 'object') {
    if ('value' in val) return isEmptyValue(val.value);
    if ('width' in val && 'height' in val) return !val.width && !val.height;
    return Object.keys(val).length === 0;
  }
  return false;
}

/** Normalize a raw metadata value into a clean scalar or array representation. */
export function normalizeRawValue(raw, key = '') {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    const items = raw
      .map((item) => {
        if (item && typeof item === 'object' && 'value' in item) return String(item.value).trim();
        if (item === null || item === undefined) return '';
        return String(item).trim();
      })
      .filter(Boolean);
    return items.length ? items : null;
  }
  if (typeof raw === 'object') {
    if ('value' in raw && raw.value != null) return String(raw.value).trim();
    return null;
  }
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  if (KNOWN_ASSET_FIELDS[key]?.type === 'boolean' && (s === 'true' || s === 'false')) {
    return s === 'true';
  }
  return s;
}

/** Infer a FieldDef.type from observed non-empty normalized values. */
export function inferFieldType(key, sampleValues) {
  if (KNOWN_ASSET_FIELDS[key]?.type) return KNOWN_ASSET_FIELDS[key].type;
  const nonEmpty = sampleValues.filter((v) => !isEmptyValue(v));
  if (nonEmpty.length === 0) return 'text';
  if (nonEmpty.some((v) => Array.isArray(v))) return 'list';
  if (nonEmpty.every((v) => typeof v === 'boolean')) return 'boolean';
  if (nonEmpty.every((v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)))) {
    return 'number';
  }
  if (nonEmpty.every((v) => typeof v === 'string' && ISO_DATE_RE.test(v))) {
    return 'date';
  }
  return 'text';
}

export function deriveOrientation(width, height) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.05) return 'Square';
  return ratio > 1 ? 'Landscape' : 'Portrait';
}

export function formatMimeType(mime) {
  if (!mime) return '';
  const map = {
    'image/jpeg': 'JPEG',
    'image/jpg': 'JPEG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
    'image/avif': 'AVIF',
    'image/gif': 'GIF',
    'image/tiff': 'TIFF',
    'image/svg+xml': 'SVG',
    'application/pdf': 'PDF',
    'application/postscript': 'AI / EPS',
    'image/vnd.adobe.photoshop': 'PSD',
    'model/gltf-binary': '3D (GLB)',
    'video/mp4': 'MP4',
    'video/quicktime': 'MOV',
  };
  if (map[mime]) return map[mime];
  const sub = mime.split('/')[1] || mime;
  return sub.toUpperCase();
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return '';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(val, bucket = 'day') {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  if (bucket === 'year') return `${yyyy}`;
  if (bucket === 'month') return `${yyyy}-${mm}`;
  return `${yyyy}-${mm}-${dd}`;
}

/** Extract the leaf label from an AEM tag value like `Asset Properties : Orientation / Portrait`. */
export function simplifyTagValue(tagStr) {
  if (!tagStr) return '';
  const s = String(tagStr);
  const slashParts = s.split('/');
  const last = slashParts[slashParts.length - 1].trim();
  const colonParts = last.split(':');
  return colonParts[colonParts.length - 1].trim();
}

/** Format a normalized field value as a display string for captions and group headers. */
export function formatFieldValue(val, fieldDef) {
  if (isEmptyValue(val)) return '';
  const type = fieldDef?.type || 'text';
  if (fieldDef?.key === 'dc:format') return formatMimeType(val);
  if (type === 'bytes') return formatBytes(val);
  if (type === 'date') return formatDate(val, 'day');
  if (type === 'boolean') return val ? 'Yes' : 'No';
  if (type === 'dimensions') {
    if (typeof val === 'object' && val.width && val.height) return `${val.width} × ${val.height}`;
    return String(val);
  }
  if (type === 'tags') {
    const arr = Array.isArray(val) ? val : [val];
    return arr.map(simplifyTagValue).filter(Boolean).join(', ');
  }
  if (Array.isArray(val)) {
    return val.join(', ');
  }
  return String(val);
}

/**
 * Discover and rank metadata fields across resolved assets.
 * Schema fields (if provided for a folder) come first in schemaOrder; remaining fields are ranked by coverage + curated priority.
 */
export function discoverFields(resolvedAssets, schemaFields = []) {
  const total = resolvedAssets.length || 1;
  const counts = new Map();
  const samples = new Map();

  for (const asset of resolvedAssets) {
    for (const [k, v] of Object.entries(asset.values || {})) {
      if (COMMON_FIELDS.some((cf) => cf.key === k)) continue;
      if (!isEmptyValue(v)) {
        counts.set(k, (counts.get(k) || 0) + 1);
        if (!samples.has(k)) samples.set(k, []);
        if (samples.get(k).length < 15) samples.get(k).push(v);
      }
    }
  }

  const schemaMap = new Map(schemaFields.map((sf, idx) => [sf.key, { ...sf, schemaOrder: idx }]));
  const allKeys = new Set([...counts.keys(), ...schemaMap.keys()]);
  const discovered = [];

  for (const key of allKeys) {
    const count = counts.get(key) || 0;
    const coverage = Number((count / total).toFixed(3));
    const schemaInfo = schemaMap.get(key);
    const known = KNOWN_ASSET_FIELDS[key];
    const type = schemaInfo?.type || inferFieldType(key, samples.get(key) || []);
    const technical = isTechnicalField(key) && !schemaInfo;
    discovered.push({
      key,
      source: 'asset',
      label: schemaInfo?.label || humanizeFieldKey(key),
      type,
      common: false,
      groupable: known ? known.groupable : ['text', 'date', 'tags', 'list', 'boolean'].includes(type),
      coverage,
      fromSchema: Boolean(schemaInfo),
      schemaOrder: schemaInfo?.schemaOrder,
      technical,
      _priority: known?.priority || 0,
    });
  }

  discovered.sort((a, b) => {
    if (a.fromSchema !== b.fromSchema) return a.fromSchema ? -1 : 1;
    if (a.fromSchema && b.fromSchema) return a.schemaOrder - b.schemaOrder;
    if (a.technical !== b.technical) return a.technical ? 1 : -1;
    // Score combines coverage (0..100) with curated priority boost (0..45)
    const scoreA = a.coverage * 100 + a._priority * 0.45;
    const scoreB = b.coverage * 100 + b._priority * 0.45;
    if (Math.abs(scoreB - scoreA) > 0.01) return scoreB - scoreA;
    return a.label.localeCompare(b.label);
  });

  // Also compute coverage on common fields
  const commonWithCoverage = COMMON_FIELDS.map((cf) => {
    let nonEmpty = 0;
    for (const asset of resolvedAssets) {
      if (!isEmptyValue(asset.values?.[cf.key])) nonEmpty++;
    }
    return { ...cf, coverage: Number((nonEmpty / total).toFixed(3)) };
  });

  return [
    ...commonWithCoverage,
    ...discovered.map(({ _priority, ...rest }) => rest),
  ];
}
