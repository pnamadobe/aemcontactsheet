// Client for creating and populating Adobe Firefly Boards via:
//   1. Adobe Federated MCP Gateway (`https://adobe-copilot-prod.adobe.io/mcp` -> `boards_create_new_board` / `boards_edit`)
//   2. Direct `aura-doc-service` V2 REST API (`https://hz-aura-doc-service.adobe.io` -> `POST /v2/create-new-board`, `POST /compose`)
//
// Lays out a contact sheet on the infinite canvas with:
//   - A Header Banner Artboard at the top (`Title · Date · Department · Prepared by · Source · Count`)
//   - Optional Group Banner Artboards (`Group: SUV (18 assets)`) when grouping is enabled
//   - One Artboard Card per Asset arranged in a clean N-column grid (`#001 · Title · Field1: Val1 · Field2: Val2`)
//     with the asset image placed inside via `addItemsToArtboard` (`presignedUrl` or `rawBlob`).

import { COMMON_FIELDS, formatFieldValue } from '../../packages/core/fields.js';
import { paginate } from '../../packages/core/layout.js';
import { mapWithConcurrency } from './utils.js';

const DEFAULT_DOC_SERVICE_URL = 'https://hz-aura-doc-service.adobe.io';
const DEFAULT_FEDERATED_MCP_URL = 'https://adobe-copilot-prod.adobe.io/mcp';
const DEFAULT_BOARDS_WEB_URL = 'https://firefly.adobe.com/boards';

/** Read PNG or JPEG pixel dimensions directly from the buffer header (`resolveItems.ts` requires exact width/height match on `rawBlob`). */
export function readImageDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  // PNG: 8-byte signature + IHDR chunk (width at offset 16, height at offset 20)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      mimeType: 'image/png',
    };
  }
  // JPEG: scan SOF0/SOF1/SOF2 markers (0xFFC0..0xFFCF except C4/C8/CC)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const len = buf.readUInt16BE(offset + 2);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height, mimeType: 'image/jpeg' };
      }
      if (len < 2) break;
      offset += 2 + len;
    }
  }
  return null;
}

/** Build an array of distinct, non-empty metadata line strings for an asset so each field gets its own text line on the board. */
export function buildAssetMetadataLines(asset, fields = [], fieldDefs = new Map(), padDigits = 3, showSequence = true) {
  const lines = [];
  const seqPrefix = showSequence !== false ? `#${String(asset.sequence || 0).padStart(padDigits, '0')} · ` : '';

  for (let i = 0; i < fields.length; i++) {
    const fSpec = fields[i];
    const def = fieldDefs.get(fSpec.key) || { key: fSpec.key, label: fSpec.label || fSpec.key, type: 'text' };
    const val = formatFieldValue(asset.values?.[fSpec.key], def);
    if (!val) continue;
    const labelStr = fSpec.showLabel ? `${fSpec.label || def.label}: ` : '';
    lines.push(`${lines.length === 0 ? seqPrefix : ''}${labelStr}${val}`.slice(0, 180));
  }

  if (lines.length === 0) {
    lines.push(`${seqPrefix}${asset.name || asset.id}`.slice(0, 180));
  }
  return lines;
}

/** Legacy single-line helper kept for backwards compatibility. */
export function buildAssetCardLabel(asset, fields = [], fieldDefs = new Map(), padDigits = 3, showSequence = true) {
  return buildAssetMetadataLines(asset, fields, fieldDefs, padDigits, showSequence).join(' · ').slice(0, 180);
}

/** Create a new Firefly Board via Federated MCP first, falling back to direct `aura-doc-service` V2 REST. */
export async function createFireflyBoard({
  docName,
  bearerToken,
  mcpUrl = DEFAULT_FEDERATED_MCP_URL,
  docServiceUrl = DEFAULT_DOC_SERVICE_URL,
  boardsWebUrl = DEFAULT_BOARDS_WEB_URL,
  fetchImpl = globalThis.fetch,
}) {
  // 1. Try Federated MCP `boards_create_new_board`
  try {
    const mcpRes = await fetchImpl(mcpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'boards_create_new_board',
          arguments: { doc_name: docName },
        },
      }),
    });
    if (mcpRes.ok) {
      const text = await mcpRes.text();
      const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
      const payload = JSON.parse(dataLine ? dataLine.slice(6) : text);
      const innerText = payload?.result?.content?.[0]?.text;
      if (innerText && !payload?.result?.isError) {
        const parsed = JSON.parse(innerText);
        if (parsed.boardId) {
          return {
            boardId: parsed.boardId,
            boardUrl: parsed.boardUrl || `${boardsWebUrl.replace(/\/+$/, '')}/id/${parsed.boardId}`,
            via: 'federated-mcp',
          };
        }
      }
    }
  } catch {
    // Fall back to direct V2 REST
  }

  // 2. Direct `aura-doc-service` POST /v2/create-new-board
  const base = docServiceUrl.replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/v2/create-new-board`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken}`,
      'x-api-key': 'aura_webapp',
    },
    body: JSON.stringify({ docName }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firefly Boards create-new-board failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  const data = await res.json();
  return {
    boardId: data.boardId,
    boardUrl: `${boardsWebUrl.replace(/\/+$/, '')}/id/${data.boardId}`,
    via: 'aura-doc-service',
  };
}

/** Execute a batch of up to 20 operations on a Firefly Board via `POST /compose`. */
export async function composeFireflyBoard({
  boardId,
  operations,
  bearerToken,
  docServiceUrl = DEFAULT_DOC_SERVICE_URL,
  fetchImpl = globalThis.fetch,
}) {
  const base = docServiceUrl.replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/compose`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken}`,
      'x-api-key': 'aura_webapp',
    },
    body: JSON.stringify({ boardId, operations }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firefly Boards /compose failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  return await res.json();
}

/**
 * Build and populate a complete Firefly Board from a resolved `SheetModel` and `ContactSheetConfig`.
 * Places:
 *   - A top header banner artboard with Title, Date, Department, Prepared by, Source, and Asset count
 *   - Optional group section banner artboards when grouping is active
 *   - One titled artboard card per asset in an N-column grid with its image inside
 */
export async function exportContactSheetToFireflyBoard({
  model,
  config,
  aem,
  bearerToken,
  docServiceUrl = DEFAULT_DOC_SERVICE_URL,
  mcpUrl = DEFAULT_FEDERATED_MCP_URL,
  boardsWebUrl = DEFAULT_BOARDS_WEB_URL,
  fetchImpl = globalThis.fetch,
  onProgress = null,
}) {
  const paginated = paginate(model, config);
  const { header, fields, layout } = paginated.config;
  const fieldDefs = new Map((model?.fields || COMMON_FIELDS).map((f) => [f.key, f]));
  for (const cf of COMMON_FIELDS) {
    if (!fieldDefs.has(cf.key)) fieldDefs.set(cf.key, cf);
  }

  const cols = Math.min(8, Math.max(1, Number(layout.columns) || 4));
  const cardW = 420;
  const cardH = 340;
  const colGap = 56;
  const rowGap = 72;
  const totalGridW = cols * cardW + (cols - 1) * colGap;
  const padDigits = Math.max(3, String(paginated.totalAssets || 1).length);

  // 1. Create the board
  const docName = header.title || model?.sourceLabel || 'AEM Contact Sheet';
  const created = await createFireflyBoard({
    docName,
    bearerToken,
    mcpUrl,
    docServiceUrl,
    boardsWebUrl,
    fetchImpl,
  });
  const { boardId, boardUrl } = created;

  // 2. Build separate header text lines at the top of the board
  const headerLines = [];
  headerLines.push(header.title || 'Contact Sheet');
  const subParts = [];
  if (header.date) subParts.push(`Date: ${header.date}`);
  if (header.department) subParts.push(`Department: ${header.department}`);
  if (header.preparedBy) subParts.push(`Prepared by: ${header.preparedBy}`);
  if (header.project) subParts.push(`Project: ${header.project}`);
  if (subParts.length) headerLines.push(subParts.join('   ·   '));
  if (header.notes) headerLines.push(`Notes: ${header.notes}`);
  const srcParts = [];
  if (model?.sourceLabel) srcParts.push(`Source: ${model.sourceLabel}`);
  srcParts.push(`${paginated.totalAssets} assets`);
  headerLines.push(srcParts.join('   ·   '));

  const allOperations = [];
  let cursorY = 0;
  const headerLineStep = 28;

  headerLines.forEach((lineText, idx) => {
    allOperations.push({
      type: 'createArtboard',
      ref: idx === 0 ? 'sheet_header' : `sheet_header_${idx}`,
      name: lineText.slice(0, 180),
      width: totalGridW,
      height: 1,
      placement: {
        kind: 'rect',
        rect: { x: 0, y: cursorY, width: totalGridW, height: 1 },
      },
    });
    cursorY += headerLineStep;
  });
  cursorY += 48;

  // Optional header logo inside the header banner artboard
  if (header.logo?.assetId && aem) {
    try {
      const { buffer } = await aem.fetchAssetThumbnailBuffer(
        { id: header.logo.assetId, name: 'logo.png', approved: header.logo.tier === 'delivery' },
        { targetPx: 320, quality: 'screen' }
      );
      const dims = readImageDimensions(buffer);
      if (dims) {
        allOperations.push({
          type: 'addItemsToArtboard',
          artboardId: '$sheet_header',
          items: [
            {
              type: 'rawBlob',
              bytesBase64: buffer.toString('base64'),
              mimeType: dims.mimeType,
              width: dims.width,
              height: dims.height,
            },
          ],
        });
      }
    } catch {
      // non-fatal
    }
  }

  // 3. Collect all assets in sorted/grouped order & resolve any images that don't have a pre-signed URL
  const orderedAssets = [];
  for (const group of paginated.sorted.groups) {
    for (const asset of group.assets) {
      orderedAssets.push(asset);
    }
  }

  // For Author assets, `asset.thumbnailUrl` is ALREADY a pre-signed blob URL (`https://author-.../aem-blob-...?sig=...`)
  // that `aura-doc-service` can fetch directly via `presignedUrl` with zero base64 overhead!
  // For assets without `thumbnailUrl` (e.g. Delivery tier), fetch the 350px thumbnail buffer and pass `rawBlob`.
  const resolvedMediaByAssetId = new Map();
  const needDownload = orderedAssets.filter((a) => !a.thumbnailUrl || !a.thumbnailUrl.startsWith('https://'));

  if (needDownload.length > 0 && aem) {
    await mapWithConcurrency(needDownload, 8, async (asset) => {
      try {
        const { buffer } = await aem.fetchAssetThumbnailBuffer(asset, { targetPx: 350, quality: 'screen' });
        const dims = readImageDimensions(buffer);
        if (dims) {
          resolvedMediaByAssetId.set(asset.id, {
            type: 'rawBlob',
            bytesBase64: buffer.toString('base64'),
            mimeType: dims.mimeType,
            width: dims.width,
            height: dims.height,
          });
        }
      } catch {
        // skip image if unavailable
      }
    });
  }

  for (const asset of orderedAssets) {
    if (!resolvedMediaByAssetId.has(asset.id) && asset.thumbnailUrl?.startsWith('https://')) {
      resolvedMediaByAssetId.set(asset.id, {
        type: 'presignedUrl',
        urls: [asset.thumbnailUrl],
      });
    }
  }

  // 4. Lay out groups and asset cards in a clean grid
  // Group operations into self-contained batches of <= 20 operations (`$ref` only resolves within the same `/compose` call!)
  const batches = [];
  let currentBatch = [];

  function pushOpPair(ops) {
    if (currentBatch.length + ops.length > 20) {
      batches.push(currentBatch);
      currentBatch = [];
    }
    currentBatch.push(...ops);
  }

  // Flush initial header ops into first batch
  pushOpPair(allOperations);

  let cardCounter = 0;
  const fieldLineStep = 26;
  const maxFieldsPerCard = Math.max(1, fields.length);
  const metadataBlockH = Math.max(0, (maxFieldsPerCard - 1) * fieldLineStep + 28);
  const effectiveRowStride = cardH + metadataBlockH + rowGap;

  for (let gIdx = 0; gIdx < paginated.sorted.groups.length; gIdx++) {
    const group = paginated.sorted.groups[gIdx];
    if (group.assets.length === 0) continue;

    if (paginated.sorted.grouped && group.title) {
      if (gIdx > 0) cursorY += 36;
      const gRef = `grp_${gIdx}`;
      pushOpPair([
        {
          type: 'createArtboard',
          ref: gRef,
          name: `${group.title} (${group.count} asset${group.count === 1 ? '' : 's'})`.slice(0, 180),
          width: totalGridW,
          height: 1,
          placement: {
            kind: 'rect',
            rect: { x: 0, y: cursorY, width: totalGridW, height: 1 },
          },
        },
      ]);
      cursorY += 54;
    }

    for (let i = 0; i < group.assets.length; i++) {
      const asset = group.assets[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (cardW + colGap);
      const y = cursorY + row * effectiveRowStride;

      cardCounter++;
      const ref = `card_${cardCounter}`;
      const lines = buildAssetMetadataLines(asset, fields, fieldDefs, padDigits, layout.sequenceNumbers !== false);
      const primaryTitle = lines[0];
      const extraLines = lines.slice(1);
      const mediaItem = resolvedMediaByAssetId.get(asset.id);

      const cellOps = [
        {
          type: 'createArtboard',
          ref,
          name: primaryTitle,
          width: cardW,
          height: cardH,
          placement: {
            kind: 'rect',
            rect: { x, y, width: cardW, height: cardH },
          },
        },
      ];
      if (mediaItem) {
        cellOps.push({
          type: 'addItemsToArtboard',
          artboardId: `$${ref}`,
          items: [mediaItem],
        });
      }

      // Create a separate, individually editable text line below the image for each additional metadata field!
      extraLines.forEach((lineStr, lIdx) => {
        const lineY = y + cardH + 28 + lIdx * fieldLineStep;
        cellOps.push({
          type: 'createArtboard',
          ref: `meta_${cardCounter}_${lIdx + 1}`,
          name: lineStr,
          width: cardW,
          height: 1,
          placement: {
            kind: 'rect',
            rect: { x, y: lineY, width: cardW, height: 1 },
          },
        });
      });

      pushOpPair(cellOps);
    }

    const totalRowsInGroup = Math.ceil(group.assets.length / cols);
    cursorY += totalRowsInGroup * effectiveRowStride;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // 5. Execute `/compose` batches sequentially so grid order is preserved
  let placedCards = 0;
  const warnings = [...paginated.warnings];

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batchOps = batches[bIdx];
    const res = await composeFireflyBoard({
      boardId,
      operations: batchOps,
      bearerToken,
      docServiceUrl,
      fetchImpl,
    });
    const createdCardsInBatch = (res?.operationResults || []).filter(
      (r) => r.type === 'createArtboard' && r.ref?.startsWith('card_') && r.status === 'success'
    ).length;
    placedCards += createdCardsInBatch;
    if (onProgress) {
      await onProgress(placedCards, orderedAssets.length);
    }
  }

  return {
    boardId,
    boardUrl,
    placedCards,
    totalAssets: orderedAssets.length,
    warnings,
  };
}
