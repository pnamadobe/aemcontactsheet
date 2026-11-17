// Pure-JS vector PDF renderer using pdf-lib that produces a real multi-page PDF Buffer
// matching `paginate()` geometry when Adobe PDF Services credentials are not yet configured.
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { COMMON_FIELDS, formatFieldValue, formatMimeType } from '../../packages/core/fields.js';
import { computeWatermarkMetrics, getThemePalette } from '../../packages/core/layout.js';
import { buildAssetDeepLink } from '../../packages/core/model.js';

const PT_PER_IN = 72;

function toAsciiSafe(str) {
  if (!str) return '';
  return String(str)
    .replace(/×/g, 'x')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function wrapTextToLines(text, font, fontSize, maxWidthPt, maxLines = 1) {
  const clean = toAsciiSafe(text).trim();
  if (!clean) return ['—'];
  const words = clean.split(/\s+/);
  const lines = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidthPt) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // Truncate last line with '...' if needed
  const lastIdx = lines.length - 1;
  if (lastIdx >= 0) {
    while (
      lines[lastIdx].length > 3 &&
      font.widthOfTextAtSize(lines[lastIdx], fontSize) > maxWidthPt
    ) {
      lines[lastIdx] = `${lines[lastIdx].slice(0, -4)}...`;
    }
  }
  return lines.slice(0, maxLines);
}

/**
 * Render a `paginate()` result + fetched thumbnail buffers into a PDF Buffer.
 * `imageBuffersByAssetId` maps `asset.id` -> `{ buffer: Buffer, ext: 'jpg'|'png' }`.
 */
export async function renderNativePdfBuffer(
  paginated,
  {
    model = null,
    imageBuffersByAssetId = new Map(),
    logoEntry = null,
    watermarkFontBuffer = null,
    generatedAt = null,
  } = {}
) {
  const pdfDoc = await PDFDocument.create();
  try {
    pdfDoc.registerFontkit(fontkit);
  } catch {
    // non-fatal if fontkit registration fails
  }
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { config, geometry, pages, totalPages, totalAssets, totalFound } = paginated;
  const { header, fields, layout, watermark } = config;
  const pal = getThemePalette(layout.theme || 'light');
  const wm = computeWatermarkMetrics(geometry, watermark || {});

  let watermarkFont = fontBold;
  if (wm.enabled) {
    if (watermarkFontBuffer && Buffer.isBuffer(watermarkFontBuffer) && watermarkFontBuffer.byteLength > 100) {
      try {
        watermarkFont = await pdfDoc.embedFont(watermarkFontBuffer);
      } catch {
        watermarkFont = fontBold;
      }
    } else if (watermark?.font === 'serif-bold') {
      watermarkFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    } else if (watermark?.font === 'mono-stamp') {
      watermarkFont = await pdfDoc.embedFont(StandardFonts.CourierBold);
    }
  }
  const fieldDefs = new Map((model?.fields || COMMON_FIELDS).map((f) => [f.key, f]));
  for (const cf of COMMON_FIELDS) {
    if (!fieldDefs.has(cf.key)) fieldDefs.set(cf.key, cf);
  }

  pdfDoc.setTitle(toAsciiSafe(header.title || 'Contact Sheet'));
  pdfDoc.setCreator('AEM Contact Sheet');

  const pageW = geometry.pageW * PT_PER_IN;
  const pageH = geometry.pageH * PT_PER_IN;
  const margin = geometry.margin * PT_PER_IN;
  const headerH = geometry.headerH * PT_PER_IN;
  const headerGap = geometry.headerGap * PT_PER_IN;
  const footerH = geometry.footerH * PT_PER_IN;
  const contentW = geometry.contentW * PT_PER_IN;
  const colGutter = geometry.colGutter * PT_PER_IN;
  const rowGutter = geometry.rowGutter * PT_PER_IN;
  const cellW = geometry.cellW * PT_PER_IN;
  const imageH = geometry.imageH * PT_PER_IN;
  const cellH = geometry.cellH * PT_PER_IN;
  const lineH = geometry.lineH * PT_PER_IN;
  const groupBandH = geometry.groupBandH * PT_PER_IN;

  let embeddedLogo = null;
  if (logoEntry?.buffer) {
    try {
      embeddedLogo =
        logoEntry.ext === 'png'
          ? await pdfDoc.embedPng(logoEntry.buffer)
          : await pdfDoc.embedJpg(logoEntry.buffer);
    } catch {
      embeddedLogo = null;
    }
  }

  const embeddedCache = new Map();
  async function getEmbeddedImage(assetId) {
    if (embeddedCache.has(assetId)) return embeddedCache.get(assetId);
    const entry = imageBuffersByAssetId.get(assetId);
    if (!entry?.buffer) return null;
    try {
      // Detect PNG vs JPEG by magic bytes
      const isPng = entry.buffer[0] === 0x89 && entry.buffer[1] === 0x50;
      const img = isPng ? await pdfDoc.embedPng(entry.buffer) : await pdfDoc.embedJpg(entry.buffer);
      embeddedCache.set(assetId, img);
      return img;
    } catch {
      return null;
    }
  }

  const subParts = [];
  if (header.department) subParts.push(header.department);
  if (header.preparedBy) subParts.push(`Prepared by ${header.preparedBy}`);
  if (header.project) subParts.push(`Project: ${header.project}`);
  if (header.notes) subParts.push(header.notes);

  const countText =
    totalFound > totalAssets
      ? `${totalAssets} of ${totalFound} assets`
      : `${totalAssets} asset${totalAssets === 1 ? '' : 's'}`;
  const sourceLineParts = [];
  if (header.showSourceLine !== false && model?.sourceLabel) {
    sourceLineParts.push(`Source: ${model.sourceLabel}`);
  }
  sourceLineParts.push(countText);

  const genTimestamp = generatedAt || model?.resolvedAt || new Date().toISOString();
  const genFormatted = genTimestamp.replace('T', ' ').slice(0, 16) + ' UTC';
  const padDigits = Math.max(3, String(totalAssets || 1).length);

  for (const p of pages) {
    const page = pdfDoc.addPage([pageW, pageH]);
    if (pal.key !== 'light') {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
        color: rgb(...pal.pageBgRgb),
      });
    }
    const headerTopY = pageH - margin;
    const headerBottomY = headerTopY - headerH;

    // Header title & metadata (left-aligned, top-aligned), with optional logo centered & top-aligned
    const textStartX = margin;
    if (embeddedLogo) {
      const maxLogoH = headerH - 10;
      const maxLogoW = 115;
      const scale = Math.min(maxLogoW / embeddedLogo.width, maxLogoH / embeddedLogo.height, 1);
      const lw = embeddedLogo.width * scale;
      const lh = embeddedLogo.height * scale;
      page.drawImage(embeddedLogo, {
        x: margin + (contentW - lw) / 2,
        y: headerTopY - lh,
        width: lw,
        height: lh,
      });
    }

    page.drawText(toAsciiSafe(header.title || 'Contact Sheet'), {
      x: textStartX,
      y: headerTopY - 14,
      size: 13,
      font: fontBold,
      color: rgb(...pal.titleRgb),
    });

    if (subParts.length) {
      page.drawText(toAsciiSafe(subParts.join(' | ')), {
        x: textStartX,
        y: headerTopY - 27,
        size: 8.5,
        font: fontRegular,
        color: rgb(...pal.metaTextRgb),
      });
    }

    page.drawText(toAsciiSafe(sourceLineParts.join(' | ')), {
      x: textStartX,
      y: headerTopY - (subParts.length ? 39 : 27),
      size: 7.5,
      font: fontRegular,
      color: rgb(...pal.mutedTextRgb),
    });

    // Right-aligned date & count
    const dateStr = toAsciiSafe(header.date || '');
    const dateW = fontBold.widthOfTextAtSize(dateStr, 8.5);
    page.drawText(dateStr, {
      x: margin + contentW - dateW,
      y: headerTopY - 13,
      size: 8.5,
      font: fontBold,
      color: rgb(...pal.titleRgb),
    });
    const cntW = fontRegular.widthOfTextAtSize(toAsciiSafe(countText), 8);
    page.drawText(toAsciiSafe(countText), {
      x: margin + contentW - cntW,
      y: headerTopY - 25,
      size: 8,
      font: fontRegular,
      color: rgb(...pal.metaTextRgb),
    });

    // Header bottom rule
    page.drawLine({
      start: { x: margin, y: headerBottomY },
      end: { x: margin + contentW, y: headerBottomY },
      thickness: 1.2,
      color: rgb(...pal.headerRuleRgb),
    });

    // Body blocks
    let cursorTopY = headerBottomY - headerGap;
    let prevWasBand = false;

    for (let bIdx = 0; bIdx < p.blocks.length; bIdx++) {
      const block = p.blocks[bIdx];
      if (block.type === 'group-band') {
        if (bIdx > 0) cursorTopY -= rowGutter;
        const bandBottomY = cursorTopY - groupBandH;
        page.drawRectangle({
          x: margin,
          y: bandBottomY,
          width: contentW,
          height: groupBandH,
          color: rgb(...pal.groupBandBgRgb),
        });
        page.drawRectangle({
          x: margin,
          y: bandBottomY,
          width: 3,
          height: groupBandH,
          color: rgb(0.08, 0.45, 0.9),
        });
        page.drawText(toAsciiSafe(block.group.title), {
          x: margin + 10,
          y: bandBottomY + (groupBandH - 8) / 2,
          size: 9,
          font: fontBold,
          color: rgb(...pal.groupBandTextRgb),
        });
        const gCountStr = `${block.group.count} asset${block.group.count === 1 ? '' : 's'}`;
        const gCountW = fontBold.widthOfTextAtSize(gCountStr, 8);
        page.drawText(gCountStr, {
          x: margin + contentW - gCountW - 8,
          y: bandBottomY + (groupBandH - 7) / 2,
          size: 8,
          font: fontBold,
          color: rgb(...pal.metaTextRgb),
        });
        cursorTopY = bandBottomY;
        prevWasBand = true;
        continue;
      }

      if (bIdx > 0) {
        cursorTopY -= prevWasBand ? 4.5 : rowGutter;
      }
      prevWasBand = false;

      const rowTopY = cursorTopY;
      for (let cIdx = 0; cIdx < block.cells.length; cIdx++) {
        const asset = block.cells[cIdx];
        const cellX = margin + cIdx * (cellW + colGutter);
        const thumbBottomY = rowTopY - imageH;

        // Thumbnail frame background & border
        page.drawRectangle({
          x: cellX,
          y: thumbBottomY,
          width: cellW,
          height: imageH,
          color: rgb(...pal.thumbBgRgb),
          borderColor: rgb(...pal.thumbBorderRgb),
          borderWidth: 0.75,
        });

        const embImg = await getEmbeddedImage(asset.id);
        if (embImg) {
          const pad = 2;
          const boxW = cellW - pad * 2;
          const boxH = imageH - pad * 2;
          const scale = Math.min(boxW / embImg.width, boxH / embImg.height);
          const drawW = embImg.width * scale;
          const drawH = embImg.height * scale;
          page.drawImage(embImg, {
            x: cellX + pad + (boxW - drawW) / 2,
            y: thumbBottomY + pad + (boxH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        } else {
          const badge = toAsciiSafe(formatMimeType(asset.format) || 'FILE');
          const bw = fontBold.widthOfTextAtSize(badge, 8);
          page.drawText(badge, {
            x: cellX + (cellW - bw) / 2,
            y: thumbBottomY + imageH / 2,
            size: 8,
            font: fontBold,
            color: rgb(0.42, 0.45, 0.5),
          });
        }

        // Draw approval / status badge pill at top-right of thumbnail if enabled
        const rawStatus = String(asset.status || asset.values?.['dam:assetStatus'] || '').toLowerCase().trim();
        if (layout.statusBadges && rawStatus) {
          const stLabel = toAsciiSafe(
            rawStatus === 'approved'
              ? 'APPROVED'
              : rawStatus === 'rejected'
                ? 'REJECTED'
                : rawStatus.replace(/[-_]+/g, ' ').toUpperCase()
          );
          const pillColor =
            rawStatus === 'approved'
              ? rgb(0.02, 0.514, 0.306)
              : rawStatus === 'rejected'
                ? rgb(0.843, 0.196, 0.125)
                : rgb(0.796, 0.435, 0.063);
          const pillFontSize = 6;
          const labelW = fontBold.widthOfTextAtSize(stLabel, pillFontSize);
          const pillW = labelW + 7;
          const pillH = 11;
          const pillX = cellX + cellW - pillW - 4;
          const pillY = rowTopY - pillH - 4;
          page.drawRectangle({
            x: pillX,
            y: pillY,
            width: pillW,
            height: pillH,
            color: pillColor,
          });
          page.drawText(stLabel, {
            x: pillX + 3.5,
            y: pillY + 3,
            size: pillFontSize,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
        }

        // Draw watermark overlay if enabled
        if (wm.enabled && wm.text) {
          const wmText = watermarkFont === fontBold ? toAsciiSafe(wm.text) : wm.text;
          const unitW = Math.max(0.5, watermarkFont.widthOfTextAtSize(wmText, 1));
          const maxFontH = imageH * (wm.position === 'center' ? 0.38 : 0.22) * (wm.coverage / 0.6);
          const wmSize = Math.max(7, Math.min(64, maxFontH, wm.targetSpanPt / unitW));
          const textW = unitW * wmSize;
          const textH = wmSize * 0.72;
          const rad = (wm.angle * Math.PI) / 180;

          const padX = cellW * 0.14;
          const padY = imageH * 0.16;
          let cx = cellX + cellW / 2;
          let cy = thumbBottomY + imageH / 2;
          if (wm.position === 'top-left') {
            cx = cellX + padX + Math.min(cellW * 0.22, textW * 0.35);
            cy = rowTopY - padY - Math.min(imageH * 0.18, textH * 0.5);
          } else if (wm.position === 'top-right') {
            cx = cellX + cellW - padX - Math.min(cellW * 0.22, textW * 0.35);
            cy = rowTopY - padY - Math.min(imageH * 0.18, textH * 0.5);
          } else if (wm.position === 'bottom-left') {
            cx = cellX + padX + Math.min(cellW * 0.22, textW * 0.35);
            cy = thumbBottomY + padY + Math.min(imageH * 0.18, textH * 0.5);
          } else if (wm.position === 'bottom-right') {
            cx = cellX + cellW - padX - Math.min(cellW * 0.22, textW * 0.35);
            cy = thumbBottomY + padY + Math.min(imageH * 0.18, textH * 0.5);
          }

          const wx = cx - (textW / 2) * Math.cos(rad) + (textH / 2) * Math.sin(rad);
          const wy = cy - (textW / 2) * Math.sin(rad) - (textH / 2) * Math.cos(rad);

          // Dual-contrast grey pass (subtle dark halo + mid-grey body so it shows on both white and black assets)
          page.drawText(wmText, {
            x: wx + 0.65,
            y: wy - 0.65,
            size: wmSize,
            font: watermarkFont,
            color: rgb(0.16, 0.16, 0.16),
            opacity: Math.min(0.95, wm.opacity * 0.65),
            rotate: degrees(wm.angle),
          });
          page.drawText(wmText, {
            x: wx,
            y: wy,
            size: wmSize,
            font: watermarkFont,
            color: rgb(0.56, 0.56, 0.56),
            opacity: wm.opacity,
            rotate: degrees(wm.angle),
          });
        }

        // Attach clickable PDF URI link annotation over the thumbnail cell if enabled
        if (layout.clickableLinks !== false) {
          try {
            const deepLink = buildAssetDeepLink(asset, model);
            if (deepLink) {
              const linkAnnot = pdfDoc.context.register(
                pdfDoc.context.obj({
                  Type: 'Annot',
                  Subtype: 'Link',
                  Rect: [cellX, thumbBottomY - 12, cellX + cellW, rowTopY],
                  Border: [0, 0, 0],
                  A: {
                    Type: 'Action',
                    S: 'URI',
                    URI: PDFString.of(deepLink),
                  },
                })
              );
              let annots = page.node.lookup(PDFName.of('Annots'));
              if (!annots) {
                annots = pdfDoc.context.obj([]);
                page.node.set(PDFName.of('Annots'), annots);
              }
              annots.push(linkAnnot);
            }
          } catch {
            // non-fatal
          }
        }

        // Caption lines below thumbnail
        let textY = thumbBottomY - 10;
        if (layout.sequenceNumbers !== false) {
          const seqStr = `#${String(asset.sequence || 0).padStart(padDigits, '0')}`;
          page.drawText(seqStr, {
            x: cellX,
            y: textY,
            size: 7.2,
            font: fontBold,
            color: rgb(...pal.mutedTextRgb),
          });
          textY -= 10.5;
        }

        for (let fIdx = 0; fIdx < fields.length; fIdx++) {
          const fSpec = fields[fIdx];
          const def = fieldDefs.get(fSpec.key) || { key: fSpec.key, label: fSpec.label || fSpec.key, type: 'text' };
          const rawVal = asset.values?.[fSpec.key];
          const formatted = formatFieldValue(rawVal, def) || '—';
          const prefix = fSpec.showLabel ? `${fSpec.label || def.label}: ` : '';
          const fullText = `${prefix}${formatted}`;
          const maxLines = Math.min(3, Math.max(1, Number(fSpec.maxLines) || 1));
          const fontToUse = fIdx === 0 && !fSpec.showLabel ? fontBold : fontRegular;
          const wrappedLines = wrapTextToLines(fullText, fontToUse, 7.8, cellW - 2, maxLines);

          for (const ln of wrappedLines) {
            page.drawText(ln, {
              x: cellX,
              y: textY,
              size: 7.8,
              font: fontToUse,
              color: fIdx === 0 && !fSpec.showLabel ? rgb(...pal.primaryTextRgb) : rgb(...pal.bodyTextRgb),
            });
            textY -= lineH;
          }
        }
      }

      cursorTopY = rowTopY - cellH;
    }

    // Footer
    const footerTopY = margin + footerH;
    page.drawLine({
      start: { x: margin, y: footerTopY },
      end: { x: margin + contentW, y: footerTopY },
      thickness: 0.6,
      color: rgb(...pal.footerRuleRgb),
    });
    const footerLeft = toAsciiSafe(
      `Generated ${genFormatted}${model?.resolvedBy ? ` | ${model.resolvedBy}` : ''}`
    );
    page.drawText(footerLeft, {
      x: margin,
      y: margin + 6,
      size: 7.5,
      font: fontRegular,
      color: rgb(...pal.mutedTextRgb),
    });
    if (layout.pageNumbers !== false) {
      const pageStr = `Page ${p.pageNumber} of ${totalPages}`;
      const pw = fontRegular.widthOfTextAtSize(pageStr, 7.5);
      page.drawText(pageStr, {
        x: margin + contentW - pw,
        y: margin + 6,
        size: 7.5,
        font: fontRegular,
        color: rgb(...pal.mutedTextRgb),
      });
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
