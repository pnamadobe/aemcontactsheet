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
      ...(overrides.layout || {}),
    },
    output: {
      quality: 'screen',
      fileName: `contact-sheet_${today}.pdf`,
      targetFolder: { id: '', path: '/content/dam/contact-sheets' },
      ...(overrides.output || {}),
    },
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
  const imageH = Number((cellW / aspect).toFixed(4));

  const lineH = 0.155; // ~11.2 pt line box
  const seqLineH = layout.sequenceNumbers !== false ? 0.15 : 0;
  const totalFieldLines = fields.reduce((sum, f) => sum + Math.min(3, Math.max(1, Number(f.maxLines) || 1)), 0);
  const captionPad = 0.1;
  const captionH = Number((seqLineH + totalFieldLines * lineH + captionPad).toFixed(4));
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
