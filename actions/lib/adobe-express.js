// Export a paginated Contact Sheet model to an editable multi-page Adobe Express document
// via Horizon JSON (HzJSON v1) and the Sensei HzJSON Import Service (`Service-f3c41ebbaca44b0384e506185c1cf583`),
// with automatic link/collaborator sharing via `invitations.adobe.io`.
import { COMMON_FIELDS, formatFieldValue } from '../../packages/core/fields.js';
import { THEME_PALETTES, computeWatermarkMetrics } from '../../packages/core/layout.js';
import { writeFileObject, getPresignedDownloadUrl } from './store.js';

async function shareExpressDocument(
  documentId,
  { bearerToken, apiKey = 'aura_webapp', shareWithEmails = [], fetchImpl = globalThis.fetch } = {}
) {
  if (!documentId || !bearerToken) return { shared: false, sharedWith: [] };
  const recipients = [
    { recipient: 'all', role: 'viewer', canComment: true },
    { recipient: 'authenticated', role: 'editor', canComment: true },
  ];
  const validEmails = [];
  for (const em of shareWithEmails || []) {
    const clean = String(em || '').trim();
    if (clean.includes('@') && !validEmails.includes(clean)) {
      validEmails.push(clean);
      recipients.push({
        recipient: `mailto:${clean}`,
        role: 'editor',
        canComment: true,
        canShare: true,
      });
    }
  }
  try {
    const res = await fetchImpl(
      `https://invitations.adobe.io/api/v4/share/${encodeURIComponent(documentId)}?mode=direct_acl`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${bearerToken}`,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ recipients }),
      }
    );
    return { shared: res.ok, sharedWith: validEmails };
  } catch {
    return { shared: false, sharedWith: [] };
  }
}

const SENSEI_PREDICT_URL =
  process.env.SENSEI_HZJSON_URL || 'https://sensei.adobe.io/services/v2/predict';
const SENSEI_ENGINE_ID =
  process.env.SENSEI_HZJSON_ENGINE || 'Feature:autocrop:Service-f3c41ebbaca44b0384e506185c1cf583';
const EXPRESS_BASE_URL =
  process.env.EXPRESS_WEB_BASE_URL || 'https://new.express.adobe.com';
const EXPRESS_API_KEY = process.env.EXPRESS_API_KEY || 'aura_webapp';
const PX_PER_IN = 96;

function hexToArgb(hex, alpha = 255) {
  const clean = String(hex || '#ffffff').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { a: alpha, r: 255, g: 255, b: 255 };
  return {
    a: alpha,
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function buildTextNode({
  text,
  tx,
  ty,
  width,
  height = 24,
  fontSize = 11,
  bold = false,
  color = { a: 255, r: 20, g: 20, b: 20 },
  alignment = 'left',
  rotation = 0,
  opacity = 1,
}) {
  const safeText = String(text || '').trim() || ' ';
  const len = safeText.length;
  return {
    sceneNodeType: 'text',
    sceneNodeOpacity: opacity,
    sceneNodeTransform: {
      rotation,
      tx: Math.round(tx),
      ty: Math.round(ty),
    },
    textGeometry: {
      type: 'autoHeight',
      width: Math.max(24, Math.round(width)),
      height: Math.max(12, Math.round(height)),
      baselineOffset: 0,
    },
    alignment,
    textModel: {
      text: safeText,
      styles: {
        ranges: [
          {
            charStyle: {
              font: {
                family: 'Source Sans Pro',
                style: bold ? 'Bold' : 'Regular',
                postscriptName: bold ? 'SourceSansPro-Bold' : 'SourceSansPro-Regular',
              },
              fontSize: Math.max(6, Math.round(fontSize * 10) / 10),
              tracking: 0,
              color,
              underline: false,
            },
            length: len,
          },
        ],
        paragraphs: [
          {
            style: {
              leading: {
                amount: 1.2,
                type: 'paragraphRelative',
              },
            },
            length: len,
          },
        ],
      },
    },
  };
}

function buildRectNode({
  tx,
  ty,
  width,
  height,
  fillColor,
  strokeColor = null,
  strokeWidth = 1,
  cornerRadius = 0,
  opacity = 1,
  rotation = 0,
}) {
  const node = {
    sceneNodeType: 'rectangle',
    sceneNodeOpacity: opacity,
    sceneNodeTransform: {
      tx: Math.round(tx),
      ty: Math.round(ty),
      rotation,
    },
    rectangleGeometry: {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
    fill: {
      fillType: 'color',
      fillColor,
    },
  };
  if (cornerRadius > 0) {
    node.rectangleCornerRadii = {
      topLeft: cornerRadius,
      topRight: cornerRadius,
      bottomRight: cornerRadius,
      bottomLeft: cornerRadius,
    };
  }
  if (strokeColor && strokeWidth > 0) {
    node.stroke = {
      strokeType: 'color',
      strokePosition: 'inside',
      strokeWidth,
      strokeColor,
    };
  }
  return node;
}

function buildBitmapRectNode({
  tx,
  ty,
  width,
  height,
  bitmapReference,
  objectFit = 'contain',
  cornerRadius = 0,
  opacity = 1,
}) {
  const node = {
    sceneNodeType: 'rectangle',
    sceneNodeOpacity: opacity,
    sceneNodeTransform: {
      tx: Math.round(tx),
      ty: Math.round(ty),
      rotation: 0,
    },
    rectangleGeometry: {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
    fill: {
      fillType: 'bitmap',
      bitmapReference,
      objectFit: objectFit === 'cover' ? 'cover' : 'contain',
    },
  };
  if (cornerRadius > 0) {
    node.rectangleCornerRadii = {
      topLeft: cornerRadius,
      topRight: cornerRadius,
      bottomRight: cornerRadius,
      bottomLeft: cornerRadius,
    };
  }
  return node;
}

/**
 * Build a complete Horizon JSON (HzJSON v1) multi-page document from a paginated Contact Sheet.
 */
export function buildContactSheetHzJson({
  paginated,
  model,
  assetUrlMap = new Map(),
  logoResource = null,
}) {
  const cfg = paginated?.config || {};
  const layout = cfg.layout || {};
  const header = cfg.header || {};
  const watermark = cfg.watermark || {};
  const fields = cfg.fields || [];
  const geo = paginated?.geometry || {};
  const themeKey = layout.theme || 'light';
  const palette = THEME_PALETTES[themeKey] || THEME_PALETTES.light;

  const pageW = Math.round((geo.pageW || 11) * PX_PER_IN);
  const pageH = Math.round((geo.pageH || 8.5) * PX_PER_IN);
  const marginPx = Math.round((geo.margin || 0.4) * PX_PER_IN);
  const headerHPx = Math.round((geo.headerH || 0.62) * PX_PER_IN);
  const headerGapPx = Math.round((geo.headerGap || 0.14) * PX_PER_IN);
  const contentWPx = Math.round((geo.contentW || (geo.pageW || 11) - (geo.margin || 0.4) * 2) * PX_PER_IN);
  const colGutterPx = Math.round((geo.colGutter || 0.14) * PX_PER_IN);
  const rowGutterPx = Math.round((geo.rowGutter || 0.18) * PX_PER_IN);
  const cellW = Math.round((geo.cellW || 2.4) * PX_PER_IN);
  const thumbH = Math.round((geo.imageH || 1.8) * PX_PER_IN);
  const cellH = Math.round((geo.cellH || 2.3) * PX_PER_IN);
  const groupBandH = Math.round((geo.groupBandH || 0.28) * PX_PER_IN);

  const pageBgColor = hexToArgb(palette.pageBg);
  const frameBgColor = hexToArgb(palette.thumbBg);
  const frameBorderColor = hexToArgb(palette.thumbBorder);
  const titleColor = hexToArgb(palette.titleColor);
  const textPrimaryColor = hexToArgb(palette.primaryText);
  const textSecondaryColor = hexToArgb(palette.metaText);
  const textMutedColor = hexToArgb(palette.mutedText);
  const bannerBgColor = hexToArgb(palette.groupBandBg || palette.thumbBg);
  const headerRuleColor = hexToArgb(palette.headerRule);

  const docTitle = header.title || model?.sourceLabel || 'AEM Contact Sheet';
  const padDigits = Math.max(3, String(paginated?.totalAssets || 1).length);
  const fieldDefs = new Map([
    ...COMMON_FIELDS.map((f) => [f.key, f]),
    ...(model?.discoveredFields || []).map((f) => [f.key, f]),
  ]);

  const resources = [];
  const registeredResourceIds = new Set();

  if (logoResource?.url) {
    resources.push({
      id: 'res_brand_logo',
      type: 'bitmaps',
      children: [
        {
          id: 'res_brand_logo_orig',
          type: 'bitmap',
          url: logoResource.url,
          mimeType: logoResource.mimeType || 'image/png',
          role: 'original',
        },
      ],
    });
    registeredResourceIds.add('res_brand_logo');
  }

  for (const [assetId, info] of assetUrlMap.entries()) {
    if (!info?.url) continue;
    const resId = `res_${String(assetId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    if (registeredResourceIds.has(resId)) continue;
    registeredResourceIds.add(resId);
    resources.push({
      id: resId,
      type: 'bitmaps',
      children: [
        {
          id: `${resId}_orig`,
          type: 'bitmap',
          url: info.url,
          mimeType: info.mimeType || 'image/jpeg',
          role: 'original',
        },
      ],
    });
  }

  const artboards = [];
  const pages = paginated?.pages || [];

  for (const page of pages) {
    const children = [];

    // 1. Page background rectangle
    children.push(
      buildRectNode({
        tx: 0,
        ty: 0,
        width: pageW,
        height: pageH,
        fillColor: pageBgColor,
      })
    );

    let cursorY = marginPx;

    // 2. Sheet Header
    if (header.enabled !== false) {
      const leftWidth = Math.round(contentWPx * 0.42);
      const rightWidth = Math.round(contentWPx * 0.28);

      children.push(
        buildTextNode({
          text: docTitle,
          tx: marginPx,
          ty: cursorY,
          width: leftWidth,
          height: 22,
          fontSize: 16,
          bold: true,
          color: titleColor,
          alignment: 'left',
        })
      );

      const subtitleParts = [
        header.department,
        header.preparedBy ? `Prepared by ${header.preparedBy}` : '',
        header.project ? `Project: ${header.project}` : '',
      ].filter(Boolean);
      if (subtitleParts.length > 0) {
        children.push(
          buildTextNode({
            text: subtitleParts.join(' · '),
            tx: marginPx,
            ty: cursorY + 21,
            width: leftWidth,
            height: 15,
            fontSize: 10,
            bold: false,
            color: textSecondaryColor,
            alignment: 'left',
          })
        );
      }

      if (model?.sourceLabel) {
        children.push(
          buildTextNode({
            text: `Source: ${model.sourceLabel}`,
            tx: marginPx,
            ty: cursorY + (subtitleParts.length > 0 ? 36 : 21),
            width: leftWidth,
            height: 14,
            fontSize: 9,
            bold: false,
            color: textMutedColor,
            alignment: 'left',
          })
        );
      }

      // Centered & top-aligned Brand Logo
      if (registeredResourceIds.has('res_brand_logo')) {
        const logoW = 120;
        const logoH = Math.max(24, headerHPx - 10);
        children.push(
          buildBitmapRectNode({
            tx: marginPx + Math.round((contentWPx - logoW) / 2),
            ty: cursorY,
            width: logoW,
            height: logoH,
            bitmapReference: 'res_brand_logo',
            objectFit: 'contain',
          })
        );
      }

      if (header.date) {
        children.push(
          buildTextNode({
            text: header.date,
            tx: marginPx + contentWPx - rightWidth,
            ty: cursorY,
            width: rightWidth,
            height: 15,
            fontSize: 10,
            bold: true,
            color: titleColor,
            alignment: 'right',
          })
        );
      }

      children.push(
        buildTextNode({
          text: `${paginated.totalAssets || 0} assets`,
          tx: marginPx + contentWPx - rightWidth,
          ty: cursorY + 16,
          width: rightWidth,
          height: 14,
          fontSize: 9.5,
          bold: false,
          color: textSecondaryColor,
          alignment: 'right',
        })
      );

      // Header bottom rule
      children.push(
        buildRectNode({
          tx: marginPx,
          ty: marginPx + headerHPx,
          width: contentWPx,
          height: 1.5,
          fillColor: headerRuleColor,
        })
      );

      cursorY = marginPx + headerHPx + headerGapPx;
    }

    // 3. Page Blocks (`group-band` & `row`)
    const blocks = page.blocks || [];
    let prevWasBand = false;

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const block = blocks[bIdx];
      if (block.type === 'group-band') {
        if (bIdx > 0) cursorY += rowGutterPx;
        children.push(
          buildRectNode({
            tx: marginPx,
            ty: cursorY,
            width: contentWPx,
            height: groupBandH,
            fillColor: bannerBgColor,
            strokeColor: frameBorderColor,
            strokeWidth: 1,
            cornerRadius: 4,
          })
        );
        // Accent left bar on group banner
        children.push(
          buildRectNode({
            tx: marginPx,
            ty: cursorY,
            width: 4,
            height: groupBandH,
            fillColor: { a: 255, r: 20, g: 115, b: 230 },
          })
        );
        children.push(
          buildTextNode({
            text: `${block.group?.title || 'Group'} (${block.group?.count || 0})`,
            tx: marginPx + 12,
            ty: cursorY + Math.max(2, Math.round((groupBandH - 14) / 2)),
            width: contentWPx - 24,
            height: 16,
            fontSize: 10.5,
            bold: true,
            color: titleColor,
            alignment: 'left',
          })
        );
        cursorY += groupBandH;
        prevWasBand = true;
        continue;
      }

      if (bIdx > 0) {
        cursorY += prevWasBand ? 6 : rowGutterPx;
      }
      prevWasBand = false;

      const cells = block.cells || [];
      for (let cIdx = 0; cIdx < cells.length; cIdx++) {
        const asset = cells[cIdx];
        const cellX = marginPx + cIdx * (cellW + colGutterPx);
        const cellY = cursorY;

        // Thumbnail frame background + border
        children.push(
          buildRectNode({
            tx: cellX,
            ty: cellY,
            width: cellW,
            height: thumbH,
            fillColor: frameBgColor,
            strokeColor: frameBorderColor,
            strokeWidth: 1,
            cornerRadius: 4,
          })
        );

        // Asset bitmap fill inside thumbnail frame
        const resId = `res_${String(asset.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        if (registeredResourceIds.has(resId)) {
          const pad = layout.fit === 'cover' ? 0 : 4;
          children.push(
            buildBitmapRectNode({
              tx: cellX + pad,
              ty: cellY + pad,
              width: cellW - pad * 2,
              height: thumbH - pad * 2,
              bitmapReference: resId,
              objectFit: layout.fit === 'cover' ? 'cover' : 'contain',
              cornerRadius: layout.fit === 'cover' ? 4 : 0,
            })
          );
        }

        // Optional approval status badge in top-right corner of thumbnail
        if (layout.statusBadges && asset.status) {
          const st = String(asset.status).toLowerCase();
          let badgeColor = { a: 235, r: 203, g: 111, b: 16 }; // amber
          let badgeLabel = st.toUpperCase();
          if (st === 'approved' || st === 'published') {
            badgeColor = { a: 235, r: 5, g: 131, b: 78 };
            badgeLabel = 'APPROVED';
          } else if (st === 'rejected') {
            badgeColor = { a: 235, r: 215, g: 50, b: 32 };
            badgeLabel = 'REJECTED';
          }
          const bw = Math.max(52, badgeLabel.length * 6 + 10);
          const bh = 16;
          const bx = cellX + cellW - bw - 6;
          const by = cellY + 6;
          children.push(
            buildRectNode({
              tx: bx,
              ty: by,
              width: bw,
              height: bh,
              fillColor: badgeColor,
              cornerRadius: 4,
            })
          );
          children.push(
            buildTextNode({
              text: badgeLabel,
              tx: bx + 2,
              ty: by + 2,
              width: bw - 4,
              height: bh,
              fontSize: 7.5,
              bold: true,
              color: { a: 255, r: 255, g: 255, b: 255 },
              alignment: 'center',
            })
          );
        }

        // Optional watermark overlay on thumbnail
        if (watermark.enabled && String(watermark.text || '').trim()) {
          const wm = computeWatermarkMetrics(geo, watermark);
          const wmW = Math.round(cellW * 0.86);
          const wmH = Math.round(wm.fontSizePt * 1.4);
          let wmX = cellX + Math.round((cellW - wmW) / 2);
          let wmY = cellY + Math.round((thumbH - wmH) / 2);
          if (wm.position === 'top-left') {
            wmX = cellX + 8;
            wmY = cellY + 8;
          } else if (wm.position === 'top-right') {
            wmX = cellX + cellW - wmW - 8;
            wmY = cellY + 8;
          } else if (wm.position === 'bottom-left') {
            wmX = cellX + 8;
            wmY = cellY + thumbH - wmH - 8;
          } else if (wm.position === 'bottom-right') {
            wmX = cellX + cellW - wmW - 8;
            wmY = cellY + thumbH - wmH - 8;
          }
          children.push(
            buildTextNode({
              text: wm.text,
              tx: wmX,
              ty: wmY,
              width: wmW,
              height: wmH,
              fontSize: Math.max(9, Math.round(wm.fontSizePt * 0.85)),
              bold: true,
              color: { a: 255, r: 140, g: 140, b: 140 },
              alignment: 'center',
              rotation: -wm.angle,
              opacity: wm.opacity,
            })
          );
        }

        // Metadata captions below thumbnail
        let textY = cellY + thumbH + 4;
        const seqNum = asset.sequence || asset.sequenceNumber;
        if (layout.sequenceNumbers !== false && seqNum) {
          children.push(
            buildTextNode({
              text: `#${String(seqNum).padStart(padDigits, '0')}`,
              tx: cellX,
              ty: textY,
              width: cellW,
              height: 12,
              fontSize: 8,
              bold: true,
              color: textMutedColor,
              alignment: 'left',
            })
          );
          textY += 12;
        }

        fields.forEach((f, fIdx) => {
          const fieldKey = f.key || f.id;
          const def = fieldDefs.get(fieldKey) || { key: fieldKey, label: f.label || fieldKey, type: 'text' };
          const rawVal = asset.values?.[fieldKey];
          const val = formatFieldValue(rawVal, def);
          if (!val) return;
          const labelPrefix = f.showLabel ? `${f.label || def.label}: ` : '';
          const lineText = `${labelPrefix}${val}`.slice(0, 95);
          children.push(
            buildTextNode({
              text: lineText,
              tx: cellX,
              ty: textY,
              width: cellW,
              height: 14,
              fontSize: fIdx === 0 ? 9.5 : 8.5,
              bold: fIdx === 0,
              color: fIdx === 0 ? textPrimaryColor : textSecondaryColor,
              alignment: 'left',
            })
          );
          textY += 13;
        });
      }

      cursorY += cellH;
    }

    // 4. Page Footer
    if (layout.pageNumbers !== false) {
      children.push(
        buildTextNode({
          text: `Page ${page.pageNumber} of ${paginated.totalPages || pages.length}`,
          tx: pageW - marginPx - 140,
          ty: pageH - marginPx - 12,
          width: 140,
          height: 14,
          fontSize: 8.5,
          bold: false,
          color: textMutedColor,
          alignment: 'right',
        })
      );
    }

    artboards.push({
      sceneNodeType: 'artboard',
      sceneNodeOpacity: 1,
      rectangleGeometry: {
        width: pageW,
        height: pageH,
      },
      children,
    });
  }

  return {
    metadata: {
      version: 1,
      documentName: docTitle,
    },
    resources,
    artwork: {
      canvasColor: pageBgColor,
      children: artboards,
    },
  };
}

/**
 * Parse Sensei `/services/v2/status/:requestId` response (supports both `multipart/mixed` and `application/json`).
 */
export function parseSenseiStatusResponse(rawText) {
  const text = String(rawText || '');
  const statusMatch = text.match(/\{"statuses"\s*:\s*\[[\s\S]*?"request_id"\s*:\s*"[^"]*"\}/);
  let carJson = null;
  if (statusMatch) {
    try {
      carJson = JSON.parse(statusMatch[0]);
    } catch {
      // ignore
    }
  } else {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.statuses) carJson = parsed;
    } catch {
      // ignore
    }
  }

  const inv = carJson?.statuses?.[0]?.invocations?.[0];
  const invStatus = String(inv?.status || '');
  if (invStatus === '202' || invStatus.toLowerCase() === 'in_progress') {
    return { done: false };
  }
  if (invStatus && invStatus !== '200') {
    let errorCode = inv?.type || 'SENSEI_IMPORT_FAILED';
    try {
      const rep = inv?.report ? JSON.parse(inv.report) : null;
      if (rep?.error_code) errorCode = rep.error_code;
    } catch {
      // ignore
    }
    return {
      done: true,
      error: {
        code: errorCode,
        status: Number(invStatus) || 500,
        message: inv?.message || `Sensei HzJSON import failed (${invStatus})`,
      },
    };
  }

  const docIdMatch =
    text.match(/"(?:documentId|assetId)"\s*:\s*"(urn:aaid:sc:[^"]+)"/) ||
    text.match(/(urn:aaid:sc:[A-Za-z0-9_-]+:[0-9a-fA-F-]{20,})/);
  if (docIdMatch?.[1]) {
    return {
      done: true,
      documentId: docIdMatch[1],
    };
  }

  if (invStatus === '200') {
    return {
      done: true,
      error: {
        code: 'MISSING_DOCUMENT_ID',
        status: 500,
        message: 'Sensei job completed without returning an Express documentId.',
      },
    };
  }

  return { done: false };
}

/**
 * Resolve publicly fetchable pre-signed URLs for all assets in `paginated` and submit the HzJSON
 * document to Sensei (`Service-f3c41ebbaca44b0384e506185c1cf583`) to create an Adobe Express document.
 */
export async function exportContactSheetToAdobeExpress({
  jobId = 'express',
  paginated,
  model,
  aem,
  bearerToken,
  apiKey = EXPRESS_API_KEY,
  shareWithEmails = [],
  fetchImpl = fetch,
  onProgress,
}) {
  const allAssets = [];
  const seen = new Set();
  for (const page of paginated?.pages || []) {
    for (const block of page.blocks || []) {
      if (block.type === 'row') {
        for (const asset of block.cells || []) {
          if (asset?.id && !seen.has(asset.id)) {
            seen.add(asset.id);
            allAssets.push(asset);
          }
        }
      }
    }
  }

  if (aem && typeof aem.enrichAuthorSignedUrls === 'function') {
    await aem.enrichAuthorSignedUrls(allAssets);
  }

  const assetUrlMap = new Map();
  let resolvedCount = 0;

  for (const asset of allAssets) {
    const webOriginal = /^(image\/jpeg|image\/jpg|image\/png|image\/webp)$/i.test(asset.mimeType || '');
    const candidateUrl =
      (webOriginal && asset.downloadUrl && /^https:\/\//i.test(asset.downloadUrl) ? asset.downloadUrl : null) ||
      (asset.thumbnailUrl && /^https:\/\//i.test(asset.thumbnailUrl) ? asset.thumbnailUrl : null);

    const hasSignature =
      candidateUrl && (/[?&](sig|se|sv|token|signature)=/i.test(candidateUrl) || /aem-blob-/i.test(candidateUrl));

    if (candidateUrl && hasSignature) {
      assetUrlMap.set(asset.id, {
        url: candidateUrl,
        mimeType: webOriginal ? asset.mimeType || 'image/jpeg' : 'image/jpeg',
      });
    } else if (aem && typeof aem.fetchAssetThumbnailBuffer === 'function') {
      try {
        const rend = await aem.fetchAssetThumbnailBuffer(asset, { targetPx: 1200, quality: 'screen' });
        if (rend?.buffer?.byteLength > 0) {
          const ext = rend.ext === 'png' ? 'png' : 'jpg';
          const fileKey = `express-tmp/${jobId}/${String(asset.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
          await writeFileObject(fileKey, rend.buffer);
          const presigned = await getPresignedDownloadUrl(fileKey, 3600);
          if (presigned && /^https:\/\//i.test(presigned)) {
            assetUrlMap.set(asset.id, {
              url: presigned,
              mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
            });
          }
        }
      } catch {
        // skip image if rendition cannot be staged
      }
    }
    resolvedCount += 1;
    if (typeof onProgress === 'function') {
      await onProgress(Math.round((resolvedCount / Math.max(1, allAssets.length)) * 50), allAssets.length);
    }
  }

  // Optional Brand Logo pre-signed URL
  let logoResource = null;
  const logoCfg = paginated?.config?.header?.logo;
  if (logoCfg?.assetId && aem && typeof aem.fetchAssetThumbnailBuffer === 'function') {
    try {
      const logoRend = await aem.fetchAssetThumbnailBuffer(
        { id: logoCfg.assetId, name: logoCfg.path?.split('/').pop() || 'logo.png', approved: logoCfg.tier === 'delivery' },
        { targetPx: 400, quality: 'print' }
      );
      if (logoRend?.buffer?.byteLength > 0) {
        const ext = logoRend.ext === 'png' ? 'png' : 'jpg';
        const fileKey = `express-tmp/${jobId}/brand-logo.${ext}`;
        await writeFileObject(fileKey, logoRend.buffer);
        const presigned = await getPresignedDownloadUrl(fileKey, 3600);
        if (presigned && /^https:\/\//i.test(presigned)) {
          logoResource = {
            url: presigned,
            mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
          };
        }
      }
    } catch {
      // ignore logo failure
    }
  }

  const hzJson = buildContactSheetHzJson({
    paginated,
    model,
    assetUrlMap,
    logoResource,
  });

  const docTitle =
    paginated?.config?.header?.title || model?.sourceLabel || 'AEM Contact Sheet';

  const contentAnalyzerRequests = {
    'sensei:engines': [
      {
        'sensei:execution_info': {
          'sensei:engine': SENSEI_ENGINE_ID,
        },
        'sensei:inputs': {
          document: {
            'dc:format': 'application/json',
            'sensei:multipart_field_name': 'document',
          },
        },
        'sensei:params': {
          documentName: docTitle,
        },
        'sensei:outputs': {
          results: {
            'dc:format': 'application/json',
            'sensei:multipart_field_name': 'results',
          },
        },
      },
    ],
  };

  const form = new FormData();
  form.append(
    'document',
    new Blob([JSON.stringify(hzJson)], { type: 'application/json' }),
    'document.json'
  );
  form.append('contentAnalyzerRequests', JSON.stringify(contentAnalyzerRequests));

  const effectiveApiKey =
    !apiKey || apiKey === 'aem-assets-frontend-1' || apiKey === 'exc_app'
      ? EXPRESS_API_KEY
      : apiKey;

  const submitRes = await fetchImpl(SENSEI_PREDICT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'x-api-key': effectiveApiKey,
      Prefer: 'respond-async',
    },
    body: form,
  });

  if (submitRes.status !== 202 && !submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`Sensei Express export failed (${submitRes.status}): ${errText.slice(0, 240)}`);
  }

  const statusUrl = submitRes.headers.get('location') || submitRes.headers.get('Location');
  if (!statusUrl) {
    throw new Error('Sensei Express export did not return a status polling URL.');
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    if (fetchImpl === globalThis.fetch) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    const pollRes = await fetchImpl(statusUrl, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'x-api-key': effectiveApiKey,
      },
    });
    if (pollRes.status === 202) continue;
    const rawText = await pollRes.text();
    const parsed = parseSenseiStatusResponse(rawText);
    if (!parsed.done) continue;
    if (parsed.error) {
      const err = new Error(parsed.error.message);
      err.code = parsed.error.code;
      err.status = parsed.error.status;
      throw err;
    }
    if (parsed.documentId) {
      const shareResult = await shareExpressDocument(parsed.documentId, {
        bearerToken,
        apiKey: effectiveApiKey,
        shareWithEmails,
        fetchImpl,
      });
      return {
        documentId: parsed.documentId,
        expressUrl: `${EXPRESS_BASE_URL.replace(/\/+$/, '')}/id/${encodeURIComponent(parsed.documentId)}`,
        expressMode: 'direct',
        sharedLinkEnabled: shareResult.shared,
        sharedWith: shareResult.sharedWith || [],
        pages: paginated?.totalPages || (paginated?.pages || []).length,
        placedAssets: allAssets.length,
      };
    }
  }

  throw new Error('Timed out waiting for Adobe Express document creation.');
}
