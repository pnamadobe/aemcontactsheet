// Page geometry, rows-per-page calculation, pagination with group-band widow protection, and file-size estimation.

import { sortAndGroup } from './sort.js';

export const PAGE_SIZES_IN = {
  letter: { width: 8.5, height: 11, label: 'Letter (8.5 × 11 in)' },
  a4: { width: 8.27, height: 11.69, label: 'A4 (210 × 297 mm)' },
  legal: { width: 8.5, height: 14, label: 'Legal (8.5 × 14 in)' },
  tabloid: { width: 11, height: 17, label: 'Tabloid (11 × 17 in)' },
  a3: { width: 11.69, height: 16.54, label: 'A3 (297 × 420 mm)' },
};

export const ASPECT_RATIOS = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '3:4': 3 / 4,
};

export const THEME_PALETTES = {
  light: {
    key: 'light',
    label: 'Clean White',
    pageBg: '#ffffff',
    pageBgRgb: [1, 1, 1],
    thumbBg: '#f8f9fb',
    thumbBgRgb: [0.97, 0.98, 0.99],
    thumbBorder: '#e5e7eb',
    thumbBorderRgb: [0.9, 0.91, 0.92],
    titleColor: '#111111',
    titleRgb: [0.07, 0.07, 0.07],
    primaryText: '#111827',
    primaryTextRgb: [0.07, 0.09, 0.15],
    bodyText: '#1f2937',
    bodyTextRgb: [0.18, 0.22, 0.28],
    metaText: '#4b5563',
    metaTextRgb: [0.3, 0.33, 0.39],
    mutedText: '#6b7280',
    mutedTextRgb: [0.42, 0.45, 0.5],
    emptyText: '#9ca3af',
    headerRule: '#222222',
    headerRuleRgb: [0.13, 0.13, 0.13],
    footerRule: '#e5e7eb',
    footerRuleRgb: [0.9, 0.91, 0.92],
    groupBandBg: '#f3f4f6',
    groupBandBgRgb: [0.95, 0.96, 0.97],
    groupBandText: '#111827',
    groupBandTextRgb: [0.07, 0.09, 0.15],
    badgeBg: '#e5e7eb',
    badgeText: '#374151',
  },
  dark: {
    key: 'dark',
    label: 'Photographer Dark',
    pageBg: '#18181b',
    pageBgRgb: [0.094, 0.094, 0.106],
    thumbBg: '#27272a',
    thumbBgRgb: [0.153, 0.153, 0.165],
    thumbBorder: '#3f3f46',
    thumbBorderRgb: [0.247, 0.247, 0.275],
    titleColor: '#fafafa',
    titleRgb: [0.98, 0.98, 0.98],
    primaryText: '#f4f4f5',
    primaryTextRgb: [0.957, 0.957, 0.961],
    bodyText: '#e4e4e7',
    bodyTextRgb: [0.894, 0.894, 0.906],
    metaText: '#a1a1aa',
    metaTextRgb: [0.631, 0.631, 0.667],
    mutedText: '#a1a1aa',
    mutedTextRgb: [0.631, 0.631, 0.667],
    emptyText: '#71717a',
    headerRule: '#52525b',
    headerRuleRgb: [0.322, 0.322, 0.357],
    footerRule: '#3f3f46',
    footerRuleRgb: [0.247, 0.247, 0.275],
    groupBandBg: '#27272a',
    groupBandBgRgb: [0.153, 0.153, 0.165],
    groupBandText: '#f4f4f5',
    groupBandTextRgb: [0.957, 0.957, 0.961],
    badgeBg: '#3f3f46',
    badgeText: '#e4e4e7',
  },
  grey: {
    key: 'grey',
    label: 'Neutral Proofing Grey',
    pageBg: '#52525b',
    pageBgRgb: [0.322, 0.322, 0.357],
    thumbBg: '#3f3f46',
    thumbBgRgb: [0.247, 0.247, 0.275],
    thumbBorder: '#71717a',
    thumbBorderRgb: [0.443, 0.443, 0.478],
    titleColor: '#ffffff',
    titleRgb: [1, 1, 1],
    primaryText: '#fafafa',
    primaryTextRgb: [0.98, 0.98, 0.98],
    bodyText: '#f4f4f5',
    bodyTextRgb: [0.957, 0.957, 0.961],
    metaText: '#e4e4e7',
    metaTextRgb: [0.894, 0.894, 0.906],
    mutedText: '#d4d4d8',
    mutedTextRgb: [0.831, 0.831, 0.847],
    emptyText: '#a1a1aa',
    headerRule: '#a1a1aa',
    headerRuleRgb: [0.631, 0.631, 0.667],
    footerRule: '#71717a',
    footerRuleRgb: [0.443, 0.443, 0.478],
    groupBandBg: '#3f3f46',
    groupBandBgRgb: [0.247, 0.247, 0.275],
    groupBandText: '#ffffff',
    groupBandTextRgb: [1, 1, 1],
    badgeBg: '#52525b',
    badgeText: '#fafafa',
  },
};

export function getThemePalette(themeKey = 'light') {
  return THEME_PALETTES[themeKey] || THEME_PALETTES.light;
}

export function createDefaultConfig(overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    configVersion: 1,
    header: {
      title: 'Contact Sheet',
      date: today,
      department: '',
      preparedBy: '',
      project: '',
      notes: '',
      logo: null,
      showSourceLine: true,
      ...(overrides.header || {}),
    },
    fields: overrides.fields || [
      { key: 'common:title', label: 'Title', maxLines: 1, showLabel: false },
      { key: 'repo:name', label: 'Filename', maxLines: 1, showLabel: false },
    ],
    sort: {
      keys: [{ field: 'repo:name', dir: 'asc' }],
      groupBy: null,
      ...(overrides.sort || {}),
    },
    layout: {
      pageSize: 'letter',
      orientation: 'landscape',
      columns: 4,
      rows: 'auto',
      imageFit: 'fit',
      imageAspect: '4:3',
      margins: 'normal',
      pageNumbers: true,
      sequenceNumbers: true,
      theme: 'light', // 'light' | 'dark' | 'grey'
      statusBadges: false,
      clickableLinks: true,
      ...(overrides.layout || {}),
    },
    output: {
      quality: 'screen',
      fileName: `contact-sheet_${today}.pdf`,
      useCustomFolder: false,
      targetFolder: { id: '', path: '/content/dam/contact-sheets' },
      ...(overrides.output || {}),
    },
    watermark: {
      enabled: false,
      text: 'CONFIDENTIAL',
      font: 'blocky', // 'blocky' | 'sans-bold' | 'condensed' | 'serif-bold' | 'mono-stamp' | 'dam:<assetId>'
      fontAssetId: null,
      fontPath: null,
      fontName: null,
      angle: 45, // degrees (-90 to 90, default 45)
      position: 'center', // 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
      opacity: 35, // 10..90 (%)
      coverage: 60, // 20..90 (% of asset span)
      ...(overrides.watermark || {}),
    },
  };
}

/**
 * Compute deterministic watermark sizing, opacity, angle, and CSS font-family stack for a thumbnail cell.
 */
export function computeWatermarkMetrics(geometry, watermark = {}) {
  const enabled = Boolean(watermark?.enabled && String(watermark?.text || '').trim());
  const text = String(watermark?.text || 'CONFIDENTIAL').trim();
  const angle = Number.isFinite(Number(watermark?.angle)) ? Number(watermark.angle) : 45;
  const position = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(watermark?.position)
    ? watermark.position
    : 'center';
  const opacityPct = Math.min(95, Math.max(5, Number(watermark?.opacity) || 35));
  const opacity = Number((opacityPct / 100).toFixed(3));
  const coveragePct = Math.min(95, Math.max(15, Number(watermark?.coverage) || 60));
  const coverage = coveragePct / 100;

  const cellW = geometry?.cellW || 2.2;
  const imageH = geometry?.imageH || 1.65;
  const fullSpanIn =
    position === 'center'
      ? Math.abs(angle) > 15 && Math.abs(angle) < 75
        ? Math.hypot(cellW, imageH) * 0.88
        : cellW * 0.92
      : Math.min(cellW, imageH) * 0.68;

  const targetSpanPt = fullSpanIn * 72 * coverage;
  const charCount = Math.max(1, text.length);
  const maxByHeightPt = imageH * 72 * (position === 'center' ? 0.38 : 0.22) * (coverage / 0.6);
  const fontSizePt = Number(
    Math.max(7, Math.min(64, maxByHeightPt, targetSpanPt / (charCount * 0.62))).toFixed(2)
  );

  let fontFamilyCss = 'Impact, "Arial Black", "Helvetica Neue Condensed Black", sans-serif';
  let isBold = true;
  if (watermark?.fontAssetId || String(watermark?.font || '').startsWith('dam:')) {
    fontFamilyCss = '"CSCustomWatermark", Impact, "Arial Black", sans-serif';
  } else if (watermark?.font === 'sans-bold') {
    fontFamilyCss = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  } else if (watermark?.font === 'condensed') {
    fontFamilyCss = '"Arial Narrow", "Roboto Condensed", Impact, sans-serif';
  } else if (watermark?.font === 'serif-bold') {
    fontFamilyCss = 'Georgia, "Times New Roman", Times, serif';
  } else if (watermark?.font === 'mono-stamp') {
    fontFamilyCss = '"Courier New", Courier, monospace';
  }

  return {
    enabled,
    text,
    angle,
    position,
    opacityPct,
    opacity,
    coveragePct,
    coverage,
    fontSizePt,
    targetSpanPt,
    fontFamilyCss,
    isBold,
  };
}

/**
 * Compute exact page geometry in inches and target thumbnail width in pixels.
 */
export function computePageGeometry(config) {
  const layout = config?.layout || {};
  const fields = config?.fields || [];
  const header = config?.header || {};
  const quality = config?.output?.quality || 'screen';

  const baseSize = PAGE_SIZES_IN[layout.pageSize] || PAGE_SIZES_IN.letter;
  const isLandscape = (layout.orientation || 'landscape') === 'landscape';
  const pageW = isLandscape ? baseSize.height : baseSize.width;
  const pageH = isLandscape ? baseSize.width : baseSize.height;

  const margin = layout.margins === 'narrow' ? 0.4 : 0.55;
  const hasNotesOrSub = Boolean(header.department || header.preparedBy || header.project || header.notes);
  const headerH = (header.logo ? 0.82 : 0.68) + (hasNotesOrSub ? 0.14 : 0);
  const footerH = 0.32;
  const headerGap = 0.12;
  const footerGap = 0.1;

  const contentW = Number((pageW - margin * 2).toFixed(4));
  const contentH = Number((pageH - margin * 2 - headerH - footerH - headerGap - footerGap).toFixed(4));

  const cols = Math.min(8, Math.max(1, Number(layout.columns) || 4));
  const colGutter = cols >= 6 ? 0.12 : 0.16;
  const rowGutter = 0.14;
  const cellW = Number(((contentW - (cols - 1) * colGutter) / cols).toFixed(4));
  const aspect = ASPECT_RATIOS[layout.imageAspect] || ASPECT_RATIOS['4:3'];
  let imageH = Number((cellW / aspect).toFixed(4));

  let lineH = 0.155; // ~11.2 pt line box
  const seqLineH = layout.sequenceNumbers !== false ? 0.15 : 0;
  const totalFieldLines = fields.reduce((sum, f) => sum + Math.min(3, Math.max(1, Number(f.maxLines) || 1)), 0);
  const captionPad = 0.1;
  let captionH = Number((seqLineH + totalFieldLines * lineH + captionPad).toFixed(4));
  if (imageH + captionH > contentH) {
    imageH = Number(Math.max(0.9, contentH - captionH).toFixed(4));
    if (imageH + captionH > contentH && totalFieldLines > 0) {
      const availForLines = Math.max(0.4, contentH - imageH - seqLineH - captionPad);
      lineH = Number(Math.max(0.1, availForLines / totalFieldLines).toFixed(4));
      captionH = Number((seqLineH + totalFieldLines * lineH + captionPad).toFixed(4));
    }
  }
  const cellH = Number((imageH + captionH).toFixed(4));

  const groupBandH = 0.32;
  const maxAutoRows = Math.max(1, Math.floor((contentH + rowGutter) / (cellH + rowGutter)));
  const requestedRows = layout.rows === 'auto' || !layout.rows ? maxAutoRows : Math.max(1, Number(layout.rows));
  const overflowWarning = requestedRows > maxAutoRows
    ? `Requested ${requestedRows} rows exceed available page height (${maxAutoRows} fit cleanly); clamping to ${maxAutoRows}.`
    : null;
  const rowsPerPage = Math.min(requestedRows, maxAutoRows);

  const ppi = quality === 'print' ? 300 : 150;
  const targetImagePx = Math.ceil(cellW * ppi);

  return {
    pageW,
    pageH,
    margin,
    headerH,
    footerH,
    headerGap,
    footerGap,
    contentW,
    contentH,
    cols,
    colGutter,
    rowGutter,
    cellW,
    imageH,
    captionH,
    cellH,
    lineH,
    seqLineH,
    groupBandH,
    maxAutoRows,
    rowsPerPage,
    perPageCapacity: cols * rowsPerPage,
    ppi,
    targetImagePx,
    overflowWarning,
  };
}

/**
 * Paginate sorted/grouped assets into deterministic pages.
 * Each page has `blocks`: `{ type: 'group-band', group }` and `{ type: 'row', cells: Asset[] }`.
 * A group band is NEVER left widowed at the bottom of a page without at least one row below it.
 */
export function paginate(model, config, options = {}) {
  const fullConfig = createDefaultConfig(config);
  const geometry = computePageGeometry(fullConfig);
  const sorted = sortAndGroup(model, fullConfig, options);
  const { cols, rowGutter, cellH, groupBandH, contentH, rowsPerPage } = geometry;

  const pages = [];
  let currentBlocks = [];
  let usedH = 0;
  let rowsOnCurrentPage = 0;

  function flushPage() {
    if (currentBlocks.length > 0) {
      pages.push({
        pageNumber: pages.length + 1,
        blocks: currentBlocks,
        assetCount: currentBlocks
          .filter((b) => b.type === 'row')
          .reduce((n, r) => n + r.cells.length, 0),
      });
      currentBlocks = [];
      usedH = 0;
      rowsOnCurrentPage = 0;
    }
  }

  function canFit(deltaH) {
    return usedH + deltaH <= contentH + 0.005;
  }

  for (let gIdx = 0; gIdx < sorted.groups.length; gIdx++) {
    const group = sorted.groups[gIdx];
    const rows = [];
    for (let i = 0; i < group.assets.length; i += cols) {
      rows.push(group.assets.slice(i, i + cols));
    }
    if (rows.length === 0) continue;

    if (sorted.grouped && sorted.newPagePerGroup && currentBlocks.length > 0) {
      flushPage();
    }

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const rowCells = rows[rIdx];
      const needBand = sorted.grouped && rIdx === 0;
      const gapBeforeBand = currentBlocks.length > 0 ? rowGutter : 0;
      const bandCost = needBand ? gapBeforeBand + groupBandH : 0;
      const gapBeforeRow = needBand ? 0.06 : currentBlocks.length > 0 ? rowGutter : 0;
      const totalNeeded = bandCost + gapBeforeRow + cellH;

      const exceedsRowCap = !sorted.grouped && rowsOnCurrentPage >= rowsPerPage;
      if ((currentBlocks.length > 0 && !canFit(totalNeeded)) || exceedsRowCap) {
        flushPage();
      }

      if (needBand) {
        const gGap = currentBlocks.length > 0 ? rowGutter : 0;
        currentBlocks.push({
          type: 'group-band',
          group: {
            id: group.id,
            title: group.title,
            fieldLabel: group.fieldLabel,
            valueLabel: group.valueLabel,
            count: group.count,
          },
        });
        usedH += gGap + groupBandH;
      }

      const rGap = needBand ? 0.06 : currentBlocks.length > 0 ? rowGutter : 0;
      currentBlocks.push({
        type: 'row',
        groupId: group.id,
        cells: rowCells,
      });
      usedH += rGap + cellH;
      rowsOnCurrentPage++;
    }
  }

  flushPage();

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, blocks: [], assetCount: 0 });
  }

  const totalPages = pages.length;
  for (const p of pages) {
    p.totalPages = totalPages;
  }

  const warnings = [...(model?.warnings || [])];
  if (geometry.overflowWarning) warnings.push(geometry.overflowWarning);
  if (sorted.totalFound > sorted.totalAssets) {
    warnings.push(`Showing first ${sorted.totalAssets} of ${sorted.totalFound} assets after sorting.`);
  }

  return {
    config: fullConfig,
    geometry,
    sorted,
    pages,
    totalPages,
    totalAssets: sorted.totalAssets,
    totalFound: sorted.totalFound,
    estimatedBytes: estimatePdfBytes(model, fullConfig, sorted.totalAssets),
    warnings,
  };
}

/**
 * Estimate output PDF file size in bytes using measured spike S5 numbers:
 * - Approved Dynamic Media JPEG: ~14 KB (Screen 350px q75) / ~42 KB (Print 700px q80)
 * - Unapproved Author static rendition: ~95 KB (thumbnail.319.png) / ~140 KB (web.1280.jpeg)
 */
export function estimatePdfBytes(model, config, count = model?.assets?.length || 0) {
  const quality = config?.output?.quality || 'screen';
  const assets = (model?.assets || []).slice(0, count);
  let totalImgBytes = 0;
  for (const a of assets) {
    if (a.approved) {
      totalImgBytes += quality === 'print' ? 42 * 1024 : 15 * 1024;
    } else {
      totalImgBytes += quality === 'print' ? 140 * 1024 : 95 * 1024;
    }
  }
  const baseOverhead = 140 * 1024;
  return baseOverhead + totalImgBytes;
}
