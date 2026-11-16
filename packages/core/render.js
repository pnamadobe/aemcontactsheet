// Shared HTML/CSS renderer for both live browser preview and Adobe PDF Services HTML→PDF ZIP input.

import { COMMON_FIELDS, formatFieldValue, formatMimeType } from './fields.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildStylesheet(geometry, { mode = 'preview' } = {}) {
  const {
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
    groupBandH,
  } = geometry;

  return `
@page {
  size: ${pageW}in ${pageH}in;
  margin: 0;
}
* {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
html, body {
  margin: 0;
  padding: 0;
  font-family: "Source Sans 3", "Adobe Clean", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1d1d1f;
  background: ${mode === 'preview' ? '#e9ebef' : '#ffffff'};
}
.cs-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${mode === 'preview' ? '24px' : '0'};
  padding: ${mode === 'preview' ? '20px' : '0'};
}
.page {
  position: relative;
  width: ${pageW}in;
  height: ${pageH}in;
  background: #ffffff;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
  ${mode === 'preview' ? 'box-shadow: 0 4px 20px rgba(0,0,0,0.12); border-radius: 3px;' : ''}
}
.page:last-child {
  page-break-after: auto;
  break-after: auto;
}
.page-header {
  position: absolute;
  top: ${margin}in;
  left: ${margin}in;
  width: ${contentW}in;
  height: ${headerH}in;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.18in;
  border-bottom: 1.5px solid #222222;
  padding-bottom: 0.06in;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 0.14in;
  min-width: 0;
  flex: 1;
}
.header-logo {
  max-height: ${Number((headerH - 0.14).toFixed(3))}in;
  max-width: 1.4in;
  object-fit: contain;
  flex-shrink: 0;
}
.header-titles {
  min-width: 0;
  flex: 1;
}
.header-title {
  font-size: 14pt;
  font-weight: 700;
  line-height: 1.15;
  color: #111111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-meta {
  font-size: 8.5pt;
  color: #4b5563;
  margin-top: 2pt;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-source {
  font-size: 7.5pt;
  color: #6b7280;
  margin-top: 2pt;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-right {
  text-align: right;
  font-size: 8.5pt;
  color: #374151;
  flex-shrink: 0;
  line-height: 1.35;
}
.header-date {
  font-weight: 600;
  color: #111111;
}
.page-body {
  position: absolute;
  top: ${Number((margin + headerH + headerGap).toFixed(4))}in;
  left: ${margin}in;
  width: ${contentW}in;
  height: ${contentH}in;
  display: flex;
  flex-direction: column;
}
.group-band {
  width: 100%;
  height: ${groupBandH}in;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f3f4f6;
  border-left: 3px solid #1473e6;
  padding: 0 0.1in;
  font-size: 9pt;
  font-weight: 700;
  color: #111827;
  margin-top: ${rowGutter}in;
}
.group-band.first-block {
  margin-top: 0;
}
.group-band-count {
  font-size: 8pt;
  font-weight: 600;
  color: #4b5563;
}
.grid-row {
  display: grid;
  grid-template-columns: repeat(${cols}, ${cellW}in);
  column-gap: ${colGutter}in;
  height: ${cellH}in;
  margin-top: ${rowGutter}in;
}
.grid-row.first-block {
  margin-top: 0;
}
.grid-row.after-band {
  margin-top: 0.06in;
}
.cell {
  width: ${cellW}in;
  height: ${cellH}in;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.thumb-frame {
  position: relative;
  width: ${cellW}in;
  height: ${imageH}in;
  background: #f8f9fb;
  border: 1px solid #e5e7eb;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.thumb-frame img {
  width: 100%;
  height: 100%;
  display: block;
}
.thumb-frame.fit img {
  object-fit: contain;
}
.thumb-frame.fill img {
  object-fit: cover;
}
.thumb-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 8pt;
  text-align: center;
  padding: 6px;
}
.thumb-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  background: #e5e7eb;
  color: #374151;
  font-weight: 700;
  font-size: 7.5pt;
  margin-bottom: 3px;
}
.caption {
  height: ${captionH}in;
  padding-top: 0.04in;
  overflow: hidden;
}
.seq-line {
  font-size: 7.5pt;
  font-weight: 700;
  color: #6b7280;
  line-height: 0.14in;
  letter-spacing: 0.02em;
}
.field-line {
  font-size: 8pt;
  line-height: ${lineH}in;
  color: #1f2937;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.field-line.primary {
  font-weight: 600;
  color: #111827;
}
.field-label {
  color: #6b7280;
  font-weight: 500;
}
.field-empty {
  color: #9ca3af;
}
.page-footer {
  position: absolute;
  bottom: ${margin}in;
  left: ${margin}in;
  width: ${contentW}in;
  height: ${footerH}in;
  border-top: 1px solid #e5e7eb;
  padding-top: 0.05in;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 7.5pt;
  color: #6b7280;
}
`.trim();
}

function defaultImageResolver(asset) {
  return asset?.thumbnailUrl || asset?.previewUrl || null;
}

/**
 * Render a paginated contact sheet (output of `paginate()`) into a complete HTML document string.
 */
export function renderHtml(
  paginated,
  {
    mode = 'preview',
    model = null,
    imageResolver = defaultImageResolver,
    logoUrl = null,
    generatedAt = null,
  } = {}
) {
  const { config, geometry, pages, totalPages, totalAssets, totalFound } = paginated;
  const { header, fields, layout } = config;
  const fieldDefs = new Map((model?.fields || COMMON_FIELDS).map((f) => [f.key, f]));
  for (const cf of COMMON_FIELDS) {
    if (!fieldDefs.has(cf.key)) fieldDefs.set(cf.key, cf);
  }

  const css = buildStylesheet(geometry, { mode });
  const subParts = [];
  if (header.department) subParts.push(escapeHtml(header.department));
  if (header.preparedBy) subParts.push(`Prepared by ${escapeHtml(header.preparedBy)}`);
  if (header.project) subParts.push(`Project: ${escapeHtml(header.project)}`);
  if (header.notes) subParts.push(escapeHtml(header.notes));

  const countText = totalFound > totalAssets
    ? `${totalAssets} of ${totalFound} assets`
    : `${totalAssets} asset${totalAssets === 1 ? '' : 's'}`;
  const sourceLineParts = [];
  if (header.showSourceLine !== false && model?.sourceLabel) {
    sourceLineParts.push(`Source: ${escapeHtml(model.sourceLabel)}`);
  }
  sourceLineParts.push(countText);

  const genTimestamp = generatedAt || model?.resolvedAt || new Date().toISOString();
  const genFormatted = genTimestamp.replace('T', ' ').slice(0, 16) + ' UTC';
  const padDigits = Math.max(3, String(totalAssets || 1).length);

  const pageSections = pages.map((page) => {
    let prevWasBand = false;
    const blocksHtml = page.blocks
      .map((block, bIdx) => {
        const firstClass = bIdx === 0 ? ' first-block' : '';
        if (block.type === 'group-band') {
          prevWasBand = true;
          const g = block.group;
          return `<div class="group-band${firstClass}">
            <span class="group-band-title">${escapeHtml(g.title)}</span>
            <span class="group-band-count">${g.count} asset${g.count === 1 ? '' : 's'}</span>
          </div>`;
        }
        const afterBandClass = prevWasBand ? ' after-band' : '';
        prevWasBand = false;

        const cellsHtml = block.cells
          .map((asset) => {
            const imgUrl = imageResolver ? imageResolver(asset) : null;
            const fitClass = layout.imageFit === 'fill' ? 'fill' : 'fit';
            const badge = formatMimeType(asset.format) || 'FILE';
            const thumbInner = imgUrl
              ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(asset.name)}" loading="lazy" />`
              : `<div class="thumb-placeholder"><span class="thumb-badge">${escapeHtml(badge)}</span><span>No preview</span></div>`;

            const seqHtml = layout.sequenceNumbers !== false
              ? `<div class="seq-line">#${String(asset.sequence || 0).padStart(padDigits, '0')}</div>`
              : '';

            const fieldLinesHtml = fields
              .map((fSpec, fIdx) => {
                const def = fieldDefs.get(fSpec.key) || { key: fSpec.key, label: fSpec.label || fSpec.key, type: 'text' };
                const rawVal = asset.values?.[fSpec.key];
                const formatted = formatFieldValue(rawVal, def);
                const maxLines = Math.min(3, Math.max(1, Number(fSpec.maxLines) || 1));
                const maxH = Number((maxLines * geometry.lineH).toFixed(4));
                const labelPrefix = fSpec.showLabel
                  ? `<span class="field-label">${escapeHtml(fSpec.label || def.label)}: </span>`
                  : '';
                const valHtml = formatted
                  ? escapeHtml(formatted)
                  : '<span class="field-empty">—</span>';
                const primaryClass = fIdx === 0 && !fSpec.showLabel ? ' primary' : '';
                return `<div class="field-line${primaryClass}" style="-webkit-line-clamp:${maxLines};max-height:${maxH}in">${labelPrefix}${valHtml}</div>`;
              })
              .join('');

            return `<article class="cell" data-asset-id="${escapeHtml(asset.id)}">
              <div class="thumb-frame ${fitClass}">${thumbInner}</div>
              <div class="caption">${seqHtml}${fieldLinesHtml}</div>
            </article>`;
          })
          .join('');

        return `<div class="grid-row${firstClass}${afterBandClass}">${cellsHtml}</div>`;
      })
      .join('');

    const logoHtml = logoUrl
      ? `<img class="header-logo" src="${escapeHtml(logoUrl)}" alt="Logo" />`
      : '';

    const pageNumHtml = layout.pageNumbers !== false
      ? `<span>Page ${page.pageNumber} of ${totalPages}</span>`
      : '<span></span>';

    return `<section class="page" data-page="${page.pageNumber}">
      <header class="page-header">
        <div class="header-left">
          ${logoHtml}
          <div class="header-titles">
            <div class="header-title">${escapeHtml(header.title || 'Contact Sheet')}</div>
            ${subParts.length ? `<div class="header-meta">${subParts.join(' · ')}</div>` : ''}
            <div class="header-source">${sourceLineParts.join(' · ')}</div>
          </div>
        </div>
        <div class="header-right">
          <div class="header-date">${escapeHtml(header.date || '')}</div>
          <div>${countText}</div>
        </div>
      </header>
      <div class="page-body">${blocksHtml}</div>
      <footer class="page-footer">
        <span>Generated ${escapeHtml(genFormatted)}${model?.resolvedBy ? ` · ${escapeHtml(model.resolvedBy)}` : ''}</span>
        ${pageNumHtml}
      </footer>
    </section>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(header.title || 'Contact Sheet')}</title>
  <style>${css}</style>
</head>
<body>
  <main class="cs-pages">
    ${pageSections.join('\n')}
  </main>
</body>
</html>`;
}
