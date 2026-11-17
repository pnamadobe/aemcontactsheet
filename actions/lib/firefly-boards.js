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

/** Execute a batch of up to 20 operations on a Firefly Board via `POST /compose`, with automatic retry on 503 `LECCoeditingLimitExceeded` / 429. */
export async function composeFireflyBoard({
  boardId,
  operations,
  bearerToken,
  docServiceUrl = DEFAULT_DOC_SERVICE_URL,
  fetchImpl = globalThis.fetch,
}) {
  const base = docServiceUrl.replace(/\/+$/, '');
  const backoffMs = [1200, 2200, 3500, 5000, 7000];
  let lastStatus = 500;
  let lastErrText = '';

  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    const res = await fetchImpl(`${base}/compose`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${bearerToken}`,
        'x-api-key': 'aura_webapp',
      },
      body: JSON.stringify({ boardId, operations }),
    });
    if (res.ok) {
      return await res.json();
    }
    lastStatus = res.status;
    lastErrText = await res.text().catch(() => '');
    const retryable =
      res.status === 503 ||
      res.status === 429 ||
      res.status === 502 ||
      res.status === 504 ||
      lastErrText.includes('LECCoeditingLimitExceeded');
    if (!retryable || attempt === backoffMs.length) {
      break;
    }
    await new Promise((r) => setTimeout(r, backoffMs[attempt]));
  }

  throw new Error(`Firefly Boards /compose failed (${lastStatus}): ${lastErrText.slice(0, 240)}`);
}

/** Compute the exact canvas dimensions `BoardSessionV2` uses for a single placed image (proportional 2048px height cap). */
export function computePlacedImageDimensions(rawW, rawH) {
  const w = Math.max(200, Number(rawW) || 1200);
  const h = Math.max(200, Number(rawH) || 900);
  if (h > 2048) {
    const scale = 2048 / h;
    return { width: Math.round(w * scale), height: 2048 };
  }
  return { width: Math.round(w), height: Math.round(h) };
}

/** Check if an asset's original binary format is directly supported by `aura-doc-service` (`image/jpeg`, `image/png`, `image/webp`). */
export function isDirectBoardsImageFormat(asset) {
  const fmt = String(asset?.format || asset?.values?.['dc:format'] || '').toLowerCase();
  if (fmt === 'image/jpeg' || fmt === 'image/jpg' || fmt === 'image/png' || fmt === 'image/webp') {
    return true;
  }
  const name = String(asset?.name || '').toLowerCase();
  return /\.(jpe?g|png|webp)$/.test(name);
}

/**
 * Build and populate a complete Firefly Board from a resolved `SheetModel` and `ContactSheetConfig`.
 * Places:
 *   - Top header text lines (Title, Date, Department, Prepared by, Source, and Asset count)
 *   - Optional group section banners when grouping is active
 *   - One high-resolution artboard card per asset in an N-column grid with separate stacked metadata lines below each card
 */
export async function exportContactSheetToFireflyBoard({
  model,
  config,
  aem,
  bearerToken,
  shareEmail = null,
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

  // Enable "Anyone with the link can edit" (`authenticated: editor`) + optional target email invite via CCX Invitations V4 direct_acl
  // so the user can open and edit the board in Firefly Boards even if signed into a different IMS Org profile.
  if (fetchImpl === globalThis.fetch && boardId) {
    try {
      const recipients = [
        { recipient: 'all', role: 'viewer', canComment: true },
        { recipient: 'authenticated', role: 'editor', canComment: true },
      ];
      if (shareEmail && String(shareEmail).includes('@')) {
        recipients.push({
          recipient: `mailto:${String(shareEmail).trim()}`,
          role: 'editor',
          canComment: true,
          canShare: true,
        });
      }
      await fetchImpl(
        `https://invitations.adobe.io/api/v4/share/${encodeURIComponent(boardId)}?mode=direct_acl`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${bearerToken}`,
            'x-api-key': 'aura_webapp',
          },
          body: JSON.stringify({ recipients }),
        }
      );
    } catch {
      // non-fatal if org sharing policy restricts link access
    }
  }

  // 2. Collect all assets in sorted/grouped order & resolve the HIGHEST resolution image for each asset
  const orderedAssets = [];
  for (const group of paginated.sorted.groups) {
    for (const asset of group.assets) {
      orderedAssets.push(asset);
    }
  }

  const resolvedMediaByAssetId = new Map();
  const placedDimsByAssetId = new Map();
  const needHighResFetch = [];

  for (const asset of orderedAssets) {
    if (
      asset.downloadUrl?.startsWith('https://') &&
      isDirectBoardsImageFormat(asset) &&
      (!asset.size || asset.size <= 35 * 1024 * 1024)
    ) {
      // Full-resolution original asset via pre-signed AEM downloadUrl!
      resolvedMediaByAssetId.set(asset.id, {
        type: 'presignedUrl',
        urls: [asset.downloadUrl],
      });
      placedDimsByAssetId.set(
        asset.id,
        computePlacedImageDimensions(asset.width || 1280, asset.height || 960)
      );
    } else if (aem) {
      needHighResFetch.push(asset);
    } else if (asset.thumbnailUrl?.startsWith('https://')) {
      resolvedMediaByAssetId.set(asset.id, {
        type: 'presignedUrl',
        urls: [asset.thumbnailUrl],
      });
      placedDimsByAssetId.set(
        asset.id,
        computePlacedImageDimensions(asset.width || 380, asset.height || 300)
      );
    }
  }

  if (needHighResFetch.length > 0 && aem) {
    await mapWithConcurrency(needHighResFetch, 8, async (asset) => {
      try {
        // Request highest resolution rendition (up to 2048px Dynamic Media JPEG or 1280px Author web JPEG)
        const { buffer } = await aem.fetchAssetThumbnailBuffer(asset, {
          targetPx: 2048,
          quality: 'print',
        });
        const dims = readImageDimensions(buffer);
        if (dims) {
          resolvedMediaByAssetId.set(asset.id, {
            type: 'rawBlob',
            bytesBase64: buffer.toString('base64'),
            mimeType: dims.mimeType,
            width: dims.width,
            height: dims.height,
          });
          placedDimsByAssetId.set(
            asset.id,
            computePlacedImageDimensions(dims.width, dims.height)
          );
          return;
        }
      } catch {
        // fall through to thumbnailUrl if available
      }
      if (asset.thumbnailUrl?.startsWith('https://')) {
        resolvedMediaByAssetId.set(asset.id, {
          type: 'presignedUrl',
          urls: [asset.thumbnailUrl],
        });
        placedDimsByAssetId.set(
          asset.id,
          computePlacedImageDimensions(asset.width || 380, asset.height || 300)
        );
      }
    });
  }

  // 3. Compute grid geometry and screen-adaptive vertical spacing (`u` = 1 screen px at full-grid fit zoom)
  // In Firefly Boards (`DecorationEngine.ts:770`), artboard name labels are a fixed 20 screen px tall (14px font)
  // regardless of zoom. Scaling vertical spacing by `u = totalGridW / 1350` guarantees clean, breathable spacing
  // both at bird's-eye view and when zoomed in close.
  const maxCardW = Math.max(
    420,
    ...orderedAssets.map((a) => (placedDimsByAssetId.get(a.id)?.width || 380) + 40)
  );
  const colGap = Math.max(64, Math.round(maxCardW * 0.12));
  const totalGridW = cols * maxCardW + (cols - 1) * colGap;
  const u = Math.max(1.6, totalGridW / 1350);

  const headerLineStep = Math.round(34 * u);
  const headerBottomGap = Math.round(60 * u);
  const groupPreGap = Math.round(44 * u);
  const groupPostGap = Math.round(64 * u);
  const firstLineOffset = Math.round(38 * u);
  const fieldLineStep = Math.round(30 * u);
  const rowGap = Math.round(72 * u);
  const textArtboardH = 0.01; // Fractional height accepted by ComposeV2RequestHandler so no white bar renders under text

  // 4. Build separate header text lines at the top of the board
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

  // Group operations into self-contained batches of <= 20 operations (`$ref` only resolves within the same `/compose` call!)
  // Packing full 20-op batches minimizes the number of LES coediting sessions opened on the board.
  const batches = [];
  let currentBatch = [];

  function pushOpPair(ops) {
    if (currentBatch.length + ops.length > 20 && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
    }
    currentBatch.push(...ops);
  }

  let cursorY = 0;
  headerLines.forEach((lineText, idx) => {
    pushOpPair([
      {
        type: 'createArtboard',
        ref: idx === 0 ? 'sheet_header' : `sheet_header_${idx}`,
        name: lineText.slice(0, 180),
        width: totalGridW,
        height: textArtboardH,
        placement: {
          kind: 'rect',
          rect: { x: 0, y: cursorY, width: totalGridW, height: textArtboardH },
        },
      },
    ]);
    cursorY += headerLineStep;
  });

  // Optional header logo placed in its own artboard below/beside the header lines
  if (header.logo?.assetId && aem) {
    try {
      const { buffer } = await aem.fetchAssetThumbnailBuffer(
        { id: header.logo.assetId, name: 'logo.png', approved: header.logo.tier === 'delivery' },
        { targetPx: 600, quality: 'print' }
      );
      const dims = readImageDimensions(buffer);
      if (dims) {
        const logoCardW = dims.width + 40;
        const logoCardH = dims.height + 40;
        pushOpPair([
          {
            type: 'createArtboard',
            ref: 'sheet_header_logo',
            name: 'Brand Logo',
            width: logoCardW,
            height: logoCardH,
            placement: {
              kind: 'rect',
              rect: { x: 0, y: cursorY, width: logoCardW, height: logoCardH },
            },
          },
          {
            type: 'addItemsToArtboard',
            artboardId: '$sheet_header_logo',
            items: [
              {
                type: 'rawBlob',
                bytesBase64: buffer.toString('base64'),
                mimeType: dims.mimeType,
                width: dims.width,
                height: dims.height,
              },
            ],
          },
        ]);
        cursorY += logoCardH + headerLineStep;
      }
    } catch {
      // non-fatal
    }
  }
  cursorY += headerBottomGap;

  // 5. Lay out groups and asset cards row-by-row, dynamically expanding row height to fit all printed metadata fields
  let cardCounter = 0;
  const assetByCardRef = new Map();

  for (let gIdx = 0; gIdx < paginated.sorted.groups.length; gIdx++) {
    const group = paginated.sorted.groups[gIdx];
    if (group.assets.length === 0) continue;

    if (paginated.sorted.grouped && group.title) {
      if (gIdx > 0) cursorY += groupPreGap;
      const gRef = `grp_${gIdx}`;
      pushOpPair([
        {
          type: 'createArtboard',
          ref: gRef,
          name: `${group.title} (${group.count} asset${group.count === 1 ? '' : 's'})`.slice(0, 180),
          width: totalGridW,
          height: textArtboardH,
          placement: {
            kind: 'rect',
            rect: { x: 0, y: cursorY, width: totalGridW, height: textArtboardH },
          },
        },
      ]);
      cursorY += groupPostGap;
    }

    for (let rowStart = 0; rowStart < group.assets.length; rowStart += cols) {
      const rowAssets = group.assets.slice(rowStart, rowStart + cols);
      let rowMaxCellH = 0;

      for (let col = 0; col < rowAssets.length; col++) {
        const asset = rowAssets[col];
        const placed = placedDimsByAssetId.get(asset.id) || { width: 380, height: 300 };
        const cardW = placed.width + 40;
        const cardH = placed.height + 40;
        const x = col * (maxCardW + colGap);
        const y = cursorY;

        cardCounter++;
        const ref = `card_${cardCounter}`;
        assetByCardRef.set(ref, asset);
        const lines = buildAssetMetadataLines(
          asset,
          fields,
          fieldDefs,
          padDigits,
          layout.sequenceNumbers !== false
        );
        const primaryTitle = lines[0];
        const extraLines = lines.slice(1);
        const mediaItem = resolvedMediaByAssetId.get(asset.id);

        const cardOps = [
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
          cardOps.push({
            type: 'addItemsToArtboard',
            artboardId: `$${ref}`,
            items: [mediaItem],
          });
        }
        // Push the 2-op card+image pair together so `$ref` resolves in the same `/compose` batch
        pushOpPair(cardOps);

        // Push each additional metadata line individually so even 10–30 metadata fields never exceed 20 ops/batch
        extraLines.forEach((lineStr, lIdx) => {
          const lineY = y + cardH + firstLineOffset + lIdx * fieldLineStep;
          pushOpPair([
            {
              type: 'createArtboard',
              ref: `meta_${cardCounter}_${lIdx + 1}`,
              name: lineStr,
              width: maxCardW,
              height: textArtboardH,
              placement: {
                kind: 'rect',
                rect: { x, y: lineY, width: maxCardW, height: textArtboardH },
              },
            },
          ]);
        });

        const metaBlockH =
          extraLines.length > 0
            ? firstLineOffset + (extraLines.length - 1) * fieldLineStep
            : 0;
        const totalCellH = cardH + metaBlockH;
        if (totalCellH > rowMaxCellH) {
          rowMaxCellH = totalCellH;
        }
      }

      cursorY += rowMaxCellH + rowGap;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // 6. Execute `/compose` batches sequentially.
  // Within every batch, all `createArtboard` ops are placed BEFORE `addItemsToArtboard` ops so that
  // artboard frames and metadata lines always commit before any image upload transaction begins.
  // If any `addItemsToArtboard` op fails, it is automatically retried in an isolated 1-op `/compose` call.
  let placedCards = 0;
  const warnings = [...paginated.warnings];

  async function buildFallbackMediaItem(asset) {
    if (!asset) return null;
    if (aem) {
      try {
        const { buffer } = await aem.fetchAssetThumbnailBuffer(asset, {
          targetPx: 1600,
          quality: 'print',
        });
        const dims = readImageDimensions(buffer);
        if (dims) {
          return {
            type: 'rawBlob',
            bytesBase64: buffer.toString('base64'),
            mimeType: dims.mimeType,
            width: dims.width,
            height: dims.height,
          };
        }
      } catch {
        // fall through
      }
    }
    if (asset.thumbnailUrl?.startsWith('https://')) {
      return {
        type: 'presignedUrl',
        urls: [asset.thumbnailUrl],
      };
    }
    return null;
  }

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    if (bIdx > 0 && fetchImpl === globalThis.fetch) {
      // Allow LES coediting service to close the previous batch's session before opening the next
      await new Promise((r) => setTimeout(r, 550));
    }
    const rawBatchOps = batches[bIdx];
    const createOps = rawBatchOps.filter((op) => op.type !== 'addItemsToArtboard');
    const addMediaOps = rawBatchOps.filter((op) => op.type === 'addItemsToArtboard');
    const batchOps = [...createOps, ...addMediaOps];

    const res = await composeFireflyBoard({
      boardId,
      operations: batchOps,
      bearerToken,
      docServiceUrl,
      fetchImpl,
    });

    const opResults = res?.operationResults || [];
    const entityIdByRef = new Map(Object.entries(res?.refs || {}));
    for (let i = 0; i < batchOps.length; i++) {
      const op = batchOps[i];
      const opRes = opResults[i];
      if (op?.ref && opRes?.createdEntityIds?.[0]) {
        entityIdByRef.set(op.ref, opRes.createdEntityIds[0]);
      }
    }

    // Check if any `addItemsToArtboard` operation failed (note: in `BoardSessionV2._placeItems`,
    // a failed `addItemsToArtboard` can also leave an open transaction affecting subsequent `addItemsToArtboard` ops in the same batch).
    const firstAddIdx = createOps.length;
    let firstFailedAddOffset = -1;
    for (let mIdx = 0; mIdx < addMediaOps.length; mIdx++) {
      const r = opResults[firstAddIdx + mIdx];
      if (r && r.status !== 'success') {
        firstFailedAddOffset = mIdx;
        break;
      }
    }

    if (firstFailedAddOffset !== -1) {
      for (let mIdx = firstFailedAddOffset; mIdx < addMediaOps.length; mIdx++) {
        const mediaOp = addMediaOps[mIdx];
        const cardRef = String(mediaOp.artboardId || '').replace(/^\$/, '');
        const realArtboardId = entityIdByRef.get(cardRef);
        if (!realArtboardId) continue;

        let retrySucceeded = false;
        try {
          const retryRes = await composeFireflyBoard({
            boardId,
            operations: [
              {
                type: 'addItemsToArtboard',
                artboardId: realArtboardId,
                items: mediaOp.items,
              },
            ],
            bearerToken,
            docServiceUrl,
            fetchImpl,
          });
          retrySucceeded = retryRes?.operationResults?.[0]?.status === 'success';
        } catch {
          retrySucceeded = false;
        }

        if (!retrySucceeded) {
          const asset = assetByCardRef.get(cardRef);
          const fallbackItem = await buildFallbackMediaItem(asset);
          if (fallbackItem) {
            try {
              await composeFireflyBoard({
                boardId,
                operations: [
                  {
                    type: 'addItemsToArtboard',
                    artboardId: realArtboardId,
                    items: [fallbackItem],
                  },
                ],
                bearerToken,
                docServiceUrl,
                fetchImpl,
              });
            } catch {
              // ignore final fallback error
            }
          }
        }
      }
    }

    const createdCardsInBatch = opResults.filter(
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
