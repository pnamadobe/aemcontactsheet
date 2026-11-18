import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportContactSheetToFireflyBoard } from '../actions/lib/firefly-boards.js';
import {
  buildContactSheetHzJson,
  exportContactSheetToAdobeExpress,
  parseSenseiStatusResponse,
} from '../actions/lib/adobe-express.js';
import { buildSheetModel, createDefaultConfig, paginate } from '../../packages/core/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test/fixtures');
const collegeRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'college-branded-raw.json'), 'utf8'));

process.env.CONTACTSHEET_LOCAL_STORE = '1';

test('exportContactSheetToFireflyBoard creates a board and places header, group banners, and asset cards', async () => {
  const rawWithThumbs = collegeRaw.slice(0, 5).map((item, idx) => ({
    ...item,
    thumbnailUrl: `https://author-p59602-e520244.adobeaemcloud.com/aem-blob-sig-${idx}.png`,
  }));
  const model = buildSheetModel({
    rawAssets: rawWithThumbs,
    sourceLabel: 'Collection: College Branded',
    resolvedBy: 'pnam@adobe.com',
  });
  const config = createDefaultConfig({
    header: { title: 'Hertz Fall Shoot Board', department: 'Brand Creative' },
    fields: [
      { key: 'common:title', label: 'Title', maxLines: 1, showLabel: false },
      { key: 'product:team', label: 'Team', maxLines: 1, showLabel: true },
    ],
    sort: {
      groupBy: { field: 'product:appareltype', dir: 'asc' },
      keys: [{ field: 'repo:name', dir: 'asc' }],
    },
    layout: { columns: 3 },
  });

  const composeCalls = [];
  const fakeBoardsFetch = async (urlStr, opts = {}) => {
    if (urlStr.endsWith('/mcp')) {
      return new Response(
        'data: ' +
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    boardId: 'urn:aaid:sc:US:test-board-999',
                    boardUrl: 'https://firefly.adobe.com/boards/id/urn:aaid:sc:US:test-board-999',
                  }),
                },
              ],
              isError: false,
            },
          }) +
          '\n\n',
        { status: 200 }
      );
    }
    if (urlStr.endsWith('/compose')) {
      const body = JSON.parse(opts.body);
      composeCalls.push(body);
      return new Response(
        JSON.stringify({
          boardId: body.boardId,
          operationResults: body.operations.map((op) => ({
            type: op.type,
            ref: op.ref,
            status: 'success',
            createdEntityIds: ['ent-1'],
          })),
          refs: {},
        }),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  const res = await exportContactSheetToFireflyBoard({
    model,
    config,
    bearerToken: 'mock-ims-token',
    fetchImpl: fakeBoardsFetch,
  });

  assert.equal(res.boardId, 'urn:aaid:sc:US:test-board-999');
  assert.equal(res.boardUrl, 'https://firefly.adobe.com/boards/id/urn:aaid:sc:US:test-board-999');
  assert.equal(res.placedCards, 5);
  assert.ok(composeCalls.length >= 1);

  const allOps = composeCalls.flatMap((c) => c.operations);
  const headerOp = allOps.find((op) => op.ref === 'sheet_header');
  assert.ok(headerOp);
  assert.match(headerOp.name, /Hertz Fall Shoot Board/);

  const cardOps = allOps.filter((op) => op.type === 'createArtboard' && op.ref?.startsWith('card_'));
  assert.equal(cardOps.length, 5);
  assert.match(cardOps[0].name, /#001/);

  // Secondary metadata fields are placed as separate text-line artboards (`meta_1_1`, etc.) below each image
  const metaOps = allOps.filter((op) => op.type === 'createArtboard' && op.ref?.startsWith('meta_'));
  assert.ok(metaOps.length >= 4);
  assert.match(metaOps[0].name, /Team:/);
  assert.equal(metaOps[0].height, 0.01);
});

test('exportContactSheetToFireflyBoard uses full-res downloadUrl and expands grid rows for 10+ metadata fields', async () => {
  const rawWithHighRes = collegeRaw.slice(0, 4).map((item, idx) => ({
    ...item,
    thumbnailUrl: `https://author-p59602-e520244.adobeaemcloud.com/thumb-319-${idx}.png`,
    downloadUrl: `https://author-p59602-e520244.adobeaemcloud.com/original-highres-${idx}.png`,
  }));
  const model = buildSheetModel({
    rawAssets: rawWithHighRes,
    sourceLabel: 'Collection: College Branded',
  });
  const tenFields = [
    { key: 'common:title', label: 'Title', maxLines: 1, showLabel: false },
    { key: 'repo:name', label: 'Filename', maxLines: 1, showLabel: true },
    { key: 'common:dimensions', label: 'Dimensions', maxLines: 1, showLabel: true },
    { key: 'repo:size', label: 'File Size', maxLines: 1, showLabel: true },
    { key: 'dc:format', label: 'Format', maxLines: 1, showLabel: true },
    { key: 'common:orientation', label: 'Orientation', maxLines: 1, showLabel: true },
    { key: 'product:brand', label: 'Brand', maxLines: 1, showLabel: true },
    { key: 'product:team', label: 'Team', maxLines: 1, showLabel: true },
    { key: 'product:appareltype', label: 'Apparel Type', maxLines: 1, showLabel: true },
    { key: 'dc:description', label: 'Description', maxLines: 1, showLabel: true },
  ];
  const config = createDefaultConfig({
    fields: tenFields,
    layout: { columns: 2 },
  });

  const composeCalls = [];
  const fakeBoardsFetch = async (urlStr, opts = {}) => {
    if (urlStr.endsWith('/mcp')) {
      return new Response(
        'data: ' +
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ boardId: 'urn:aaid:sc:US:board-10fields' }) }],
              isError: false,
            },
          }) +
          '\n\n',
        { status: 200 }
      );
    }
    if (urlStr.endsWith('/compose')) {
      const body = JSON.parse(opts.body);
      composeCalls.push(body);
      return new Response(
        JSON.stringify({
          boardId: body.boardId,
          operationResults: body.operations.map((op) => ({
            type: op.type,
            ref: op.ref,
            status: 'success',
          })),
        }),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  await exportContactSheetToFireflyBoard({
    model,
    config,
    bearerToken: 'mock-ims-token',
    fetchImpl: fakeBoardsFetch,
  });

  // Verify no batch ever exceeds the 20-operation `/compose` limit
  for (const call of composeCalls) {
    assert.ok(call.operations.length <= 20, `Batch size ${call.operations.length} exceeded 20`);
  }

  const allOps = composeCalls.flatMap((c) => c.operations);
  // Verify full-res downloadUrl is used instead of 319px thumbnailUrl
  const addMediaOps = allOps.filter((op) => op.type === 'addItemsToArtboard');
  assert.equal(addMediaOps.length, 4);
  assert.match(addMediaOps[0].items[0].urls[0], /original-highres-0\.png/);

  // Verify row 2 (`card_3`) is positioned well below the last metadata line of row 1 (`meta_1_*`)
  const card3 = allOps.find((op) => op.ref === 'card_3');
  const card1MetaOps = allOps.filter((op) => op.ref?.startsWith('meta_1_'));
  assert.ok(card1MetaOps.length >= 8);
  const lastMetaY = Math.max(...card1MetaOps.map((op) => op.placement.rect.y));
  assert.ok(
    card3.placement.rect.y > lastMetaY + 100,
    `Expected row 2 card (${card3.placement.rect.y}) to be well below row 1's last metadata line (${lastMetaY})`
  );
});

test('exportContactSheetToAdobeExpress builds multi-page HzJSON v1 and creates an Adobe Express document via Sensei', async () => {
  const rawWithSigned = collegeRaw.slice(0, 6).map((item, idx) => ({
    ...item,
    thumbnailUrl: `https://author-p59602-e520244.adobeaemcloud.com/aem-blob-${idx}.jpg?sig=abc`,
    downloadUrl: `https://author-p59602-e520244.adobeaemcloud.com/aem-blob-orig-${idx}.jpg?sig=abc`,
  }));
  const model = buildSheetModel({
    rawAssets: rawWithSigned,
    sourceLabel: 'Collection: College Branded',
  });
  const config = createDefaultConfig({
    header: { title: 'Express Lookbook Test', preparedBy: 'Peter Nam' },
    layout: { columns: 2, theme: 'dark', statusBadges: true },
    watermark: { enabled: true, text: 'CONFIDENTIAL', angle: 45, position: 'center', opacity: 35, coverage: 60 },
  });
  const paginated = paginate(model, config);

  const assetUrlMap = new Map(
    model.assets.map((a, idx) => [
      a.id,
      {
        url: `https://author-p59602-e520244.adobeaemcloud.com/aem-blob-orig-${idx}.jpg?sig=abc`,
        mimeType: 'image/jpeg',
        width: 1600,
        height: 800,
      },
    ])
  );
  const hzJson = buildContactSheetHzJson({ paginated, model, assetUrlMap });
  assert.equal(hzJson.metadata.version, 1);
  assert.equal(hzJson.metadata.documentName, 'Express Lookbook Test');
  assert.equal(hzJson.resources.length, 6);
  assert.ok(hzJson.artwork.children.length >= 1);
  assert.equal(hzJson.artwork.children[0].sceneNodeType, 'artboard');

  // Verify bitmap nodes preserve native 2:1 aspect ratio (`width / height === 2`) instead of stretching to 4:3 frame
  const bitmapNodes = hzJson.artwork.children[0].children.filter((n) => n.fill?.fillType === 'bitmap');
  assert.ok(bitmapNodes.length >= 1);
  const firstBmp = bitmapNodes[0].rectangleGeometry;
  assert.ok(
    Math.abs(firstBmp.width / firstBmp.height - 2) < 0.05,
    `Expected 2:1 aspect ratio on bitmap node, got ${firstBmp.width}x${firstBmp.height}`
  );

  // Verify multipart/mixed Sensei status response parser
  const sampleMultipart = [
    '--Boundary_123',
    'Content-Type: application/json',
    'Content-Disposition: form-data; name="contentAnalyzerResponse"',
    '',
    JSON.stringify({
      statuses: [
        {
          'sensei:engine': 'Feature:autocrop:Service-f3c41ebbaca44b0384e506185c1cf583',
          invocations: [
            {
              'sensei:outputs': { results: { 'dc:format': 'application/json', 'sensei:multipart_field_name': 'results' } },
              message: null,
              status: '200',
            },
          ],
        },
      ],
      request_id: 'req-express-1',
    }),
    '--Boundary_123',
    'Content-Type: application/json',
    'Content-Disposition: form-data; name="results"',
    '',
    JSON.stringify({ documentId: 'urn:aaid:sc:US:express-doc-777' }),
    '--Boundary_123--',
  ].join('\r\n');

  const parsedStatus = parseSenseiStatusResponse(sampleMultipart);
  assert.equal(parsedStatus.done, true);
  assert.equal(parsedStatus.documentId, 'urn:aaid:sc:US:express-doc-777');

  const fakeExpressFetch = async (urlStr) => {
    if (String(urlStr).includes('/services/v2/predict')) {
      return new Response('', {
        status: 202,
        headers: { location: 'https://senseicore-ue1.adobe.io/services/v2/status/req-express-1' },
      });
    }
    if (String(urlStr).includes('/services/v2/status/req-express-1')) {
      return new Response(sampleMultipart, {
        status: 200,
        headers: { 'content-type': 'multipart/mixed; boundary=Boundary_123' },
      });
    }
    if (String(urlStr).includes('invitations.adobe.io')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  const expressRes = await exportContactSheetToAdobeExpress({
    jobId: 'test_express_1',
    paginated,
    model,
    bearerToken: 'mock-express-token',
    shareWithEmails: ['pnam@adobe.com'],
    fetchImpl: fakeExpressFetch,
  });

  assert.equal(expressRes.documentId, 'urn:aaid:sc:US:express-doc-777');
  assert.equal(expressRes.expressUrl, 'https://new.express.adobe.com/id/urn:aaid:sc:US:express-doc-777');
  assert.equal(expressRes.expressMode, 'direct');
  assert.equal(expressRes.sharedLinkEnabled, true);
  assert.equal(expressRes.placedAssets, 6);
});
