// Multi-level sorting, grouping, and sortable-field list construction (§6 of mvp-architecture.md).

import {
  COMMON_FIELDS,
  formatDate,
  formatMimeType,
  humanizeFieldKey,
  isEmptyValue,
  simplifyTagValue,
} from './fields.js';

export const NO_VALUE_GROUP_LABEL = '(No value)';

/**
 * Build the list of fields available in the Sort & Group dropdowns:
 * all common fields first, plus any metadata fields the user selected to print (deduplicated),
 * plus any additional discovered fields on the model for convenience.
 */
export function getSortableFields(modelFields = [], printedFieldSpecs = []) {
  const byKey = new Map(modelFields.map((f) => [f.key, f]));
  for (const cf of COMMON_FIELDS) {
    if (!byKey.has(cf.key)) byKey.set(cf.key, cf);
  }

  const seen = new Set();
  const result = [];

  // 1. Common fields in canonical order
  for (const cf of COMMON_FIELDS) {
    seen.add(cf.key);
    result.push({ ...(byKey.get(cf.key) || cf), section: 'common' });
  }

  // 2. Printed metadata fields selected by the user (in print order)
  for (const spec of printedFieldSpecs) {
    if (!spec?.key || seen.has(spec.key)) continue;
    seen.add(spec.key);
    const friendly = spec.label && !spec.label.includes(':') ? spec.label : humanizeFieldKey(spec.key);
    const def = byKey.get(spec.key) || {
      key: spec.key,
      source: 'asset',
      label: friendly,
      type: 'text',
      groupable: true,
    };
    result.push({ ...def, label: friendly || def.label, section: 'printed' });
  }

  // 3. Remaining non-technical discovered fields
  for (const f of modelFields) {
    if (seen.has(f.key) || f.technical) continue;
    seen.add(f.key);
    const friendly = f.label && !f.label.includes(':') ? f.label : humanizeFieldKey(f.key);
    result.push({ ...f, label: friendly, section: 'discovered' });
  }

  return result;
}

/** Extract a scalar comparable primitive for a given asset & field definition. */
export function extractComparable(asset, fieldDef) {
  const key = typeof fieldDef === 'string' ? fieldDef : fieldDef.key;
  const type = typeof fieldDef === 'object' && fieldDef?.type ? fieldDef.type : 'text';
  const raw = asset?.values?.[key];
  if (isEmptyValue(raw)) return null;

  if (key === 'dc:format') {
    return formatMimeType(raw);
  }
  if (type === 'number' || type === 'bytes') {
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'dimensions') {
    if (typeof raw === 'object' && raw.width && raw.height) {
      return Number(raw.width) * Number(raw.height);
    }
    return null;
  }
  if (type === 'date') {
    const s = Array.isArray(raw) ? raw[0] : raw;
    const str = String(s).trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }
  if (type === 'boolean') {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return Boolean(v) ? 1 : 0;
  }
  if (type === 'tags') {
    const first = Array.isArray(raw) ? raw[0] : raw;
    const leaf = simplifyTagValue(first);
    return leaf || null;
  }
  if (Array.isArray(raw)) {
    const first = raw.find((x) => !isEmptyValue(x));
    return first !== undefined ? String(first) : null;
  }
  return String(raw);
}

/** Create a comparator for two assets over a list of sort keys + stable tie-breakers. */
export function createAssetComparator(sortKeys = [], fieldMap = new Map(), locale = 'en') {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const effectiveKeys = (sortKeys || []).filter((k) => k && k.field);

  return function compareAssets(a, b) {
    for (const { field, dir = 'asc' } of effectiveKeys) {
      const def = fieldMap.get(field) || COMMON_FIELDS.find((c) => c.key === field) || { key: field, type: 'text' };
      const va = extractComparable(a, def);
      const vb = extractComparable(b, def);

      const aEmpty = va === null || va === undefined || va === '';
      const bEmpty = vb === null || vb === undefined || vb === '';
      // Empty values ALWAYS sort last regardless of direction (§6.2)
      if (aEmpty && bEmpty) continue;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = collator.compare(String(va), String(vb));
      }
      if (cmp !== 0) {
        return dir === 'desc' ? -cmp : cmp;
      }
    }

    // Stable tie-breakers: repo:name (natural) then id
    const nameCmp = collator.compare(String(a.name || ''), String(b.name || ''));
    if (nameCmp !== 0) return nameCmp;
    return String(a.id || '').localeCompare(String(b.id || ''));
  };
}

/** Compute the group key and display value for an asset given groupBy config. */
export function extractGroupBucket(asset, groupBy, fieldDef) {
  const key = groupBy.field;
  const raw = asset?.values?.[key];
  if (isEmptyValue(raw)) {
    return { empty: true, key: '__EMPTY__', label: NO_VALUE_GROUP_LABEL, sortValue: null };
  }

  const type = fieldDef?.type || 'text';
  if (key === 'repo:name') {
    const ch = String(raw).trim().charAt(0).toUpperCase() || '#';
    const bucket = /[A-Z]/.test(ch) ? ch : '#';
    return { empty: false, key: bucket, label: bucket, sortValue: bucket };
  }
  if (key === 'dc:format') {
    const label = formatMimeType(raw);
    return { empty: false, key: label, label, sortValue: label };
  }
  if (type === 'date') {
    const bucketMode = groupBy.dateBucket || 'day';
    const label = formatDate(Array.isArray(raw) ? raw[0] : raw, bucketMode);
    if (!label) return { empty: true, key: '__EMPTY__', label: NO_VALUE_GROUP_LABEL, sortValue: null };
    return { empty: false, key: label, label, sortValue: label };
  }
  if (type === 'tags') {
    const first = Array.isArray(raw) ? raw[0] : raw;
    const leaf = simplifyTagValue(first);
    if (!leaf) return { empty: true, key: '__EMPTY__', label: NO_VALUE_GROUP_LABEL, sortValue: null };
    return { empty: false, key: leaf.toLowerCase(), label: leaf, sortValue: leaf };
  }
  if (type === 'boolean') {
    const b = Boolean(Array.isArray(raw) ? raw[0] : raw);
    const label = b ? 'Yes' : 'No';
    return { empty: false, key: label, label, sortValue: b ? 1 : 0 };
  }
  const first = Array.isArray(raw) ? raw.find((x) => !isEmptyValue(x)) : raw;
  const label = String(first).trim();
  if (!label) return { empty: true, key: '__EMPTY__', label: NO_VALUE_GROUP_LABEL, sortValue: null };
  return { empty: false, key: label.toLowerCase(), label, sortValue: label };
}

/**
 * Sort and optionally group the model's assets according to `config.sort`,
 * applying the 500-asset cap after sorting when `limitToMaxAssets` is true,
 * and assigning 1-based continuous `sequence` numbers across the entire sheet.
 */
export function sortAndGroup(model, config = {}, { locale = 'en', limitToMaxAssets = true } = {}) {
  const fields = model?.fields || COMMON_FIELDS;
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const sortCfg = config?.sort || {};
  const sortKeys = sortCfg.keys?.length
    ? sortCfg.keys
    : [{ field: 'repo:name', dir: 'asc' }];
  const comparator = createAssetComparator(sortKeys, fieldMap, locale);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });

  // First sort all assets by sortKeys so capping at maxAssets keeps the top N after sorting
  let working = [...(model?.assets || [])];
  const groupBy = sortCfg.groupBy?.field ? sortCfg.groupBy : null;

  if (!groupBy) {
    working.sort(comparator);
    if (limitToMaxAssets && model?.maxAssets && working.length > model.maxAssets) {
      working = working.slice(0, model.maxAssets);
    }
    const sequenced = working.map((asset, i) => ({ ...asset, sequence: i + 1 }));
    return {
      grouped: false,
      totalAssets: sequenced.length,
      totalFound: model?.totalFound ?? sequenced.length,
      groups: [
        {
          id: 'all',
          fieldKey: null,
          fieldLabel: null,
          valueLabel: null,
          title: null,
          count: sequenced.length,
          assets: sequenced,
        },
      ],
    };
  }

  const groupDef = fieldMap.get(groupBy.field)
    || COMMON_FIELDS.find((c) => c.key === groupBy.field)
    || { key: groupBy.field, label: groupBy.field, type: 'text' };

  const bucketMap = new Map();
  for (const asset of working) {
    const b = extractGroupBucket(asset, groupBy, groupDef);
    if (!bucketMap.has(b.key)) {
      bucketMap.set(b.key, { ...b, assets: [] });
    }
    bucketMap.get(b.key).assets.push(asset);
  }

  const groupDir = groupBy.dir === 'desc' ? -1 : 1;
  const groups = [...bucketMap.values()].sort((ga, gb) => {
    // Empty bucket always last
    if (ga.empty && gb.empty) return 0;
    if (ga.empty) return 1;
    if (gb.empty) return -1;
    if (typeof ga.sortValue === 'number' && typeof gb.sortValue === 'number') {
      return (ga.sortValue - gb.sortValue) * groupDir;
    }
    return collator.compare(String(ga.sortValue), String(gb.sortValue)) * groupDir;
  });

  // Sort assets inside each group and apply cap across ordered groups
  let remaining = limitToMaxAssets && model?.maxAssets ? model.maxAssets : Infinity;
  let seq = 1;
  const finalGroups = [];

  for (const g of groups) {
    if (remaining <= 0) break;
    g.assets.sort(comparator);
    const slice = g.assets.slice(0, remaining);
    remaining -= slice.length;
    const withSeq = slice.map((asset) => ({ ...asset, sequence: seq++ }));
    finalGroups.push({
      id: `grp-${g.key}`,
      fieldKey: groupDef.key,
      fieldLabel: groupDef.label,
      valueLabel: g.label,
      title: `${groupDef.label}: ${g.label}`,
      empty: g.empty,
      count: withSeq.length,
      assets: withSeq,
    });
  }

  return {
    grouped: true,
    groupField: groupDef,
    newPagePerGroup: Boolean(groupBy.newPagePerGroup),
    totalAssets: seq - 1,
    totalFound: model?.totalFound ?? (seq - 1),
    groups: finalGroups,
  };
}
