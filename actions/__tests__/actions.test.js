import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, PDFName } from 'pdf-lib';
import { buildZipBuffer } from '../lib/zip.js';
import { resolveUniqueFileName } from '../lib/aem.js';
import { renderNativePdfBuffer } from '../lib/pdf-native.js';
import { exportContactSheetToFireflyBoard } from '../lib/firefly-boards.js';
import { main as resolveWorkerMain } from '../resolve-worker/index.js';
import { main as generateWorkerMain } from '../generate-worker/index.js';
import { main as statusMain } from '../status/index.js';
import { main as presetsMain } from '../presets/index.js';
import { main as prefsMain } from '../prefs/index.js';
import { buildAssetDeepLink, buildSheetModel, createDefaultConfig, paginate, renderHtml } from '../../packages/core/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test/fixtures');
const collegeRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'college-branded-raw.json'), 'utf8'));

process.env.CONTACTSHEET_LOCAL_STORE = '1';

const mockAuth = {
  bearerToken: 'mock-ims-token',
  imsOrg: '4A603BC061E191130A495FEF@AdobeOrg',
  apiKey: 'aem-assets-frontend-1',
  userId: 'pnam@adobe.com',
  userEmail: 'pnam@adobe.com',
  userHash: '56651078671722645a992350',
};

test('buildZipBuffer produces a valid ZIP archive with index.html at top level', () => {
  const zip = buildZipBuffer([
    { name: 'index.html', data: '<!DOCTYPE html><html><body>Hello</body></html>' },
    { name: 'img/1.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
  ]);
  // Starts with PK\x03\x04 local file header signature
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('index.html')));
  assert.ok(zip.includes(Buffer.from('img/1.jpg')));
});

test('resolve-worker -> status -> generate-worker end-to-end pipeline with AEM upload verification', async () => {
  const uploadedMetadata = [];
  const fakeFetch = async (urlStr, opts = {}) => {
    const u = new URL(urlStr);
    // 1. Collection items on Delivery
    if (u.pathname.includes('/adobe/assets/collections/')) {
      return new Response(
        JSON.stringify({
          hits: { results: collegeRaw.slice(0, 6) },
          cursor: null,
          search_metadata: { totalCount: { total: 6 } },
        }),
        { status: 200 }
      );
    }
    // 2. Dynamic Media delivery image fetch
    if (u.pathname.includes('/as/') && u.pathname.endsWith('.jpg')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]), { status: 200 });
    }
    // 3. Folder create
    if (u.pathname.endsWith('/folders') && opts.method === 'POST') {
      return new Response(JSON.stringify({ data: { values: { successes: [] } } }), { status: 200 });
    }
    // 4. Initiate upload
    if (u.pathname === '/adobe/assets' && opts.method === 'POST') {
      return new Response(
        JSON.stringify({
          data: {
            values: [
              {
                id: 'urn:aaid:aem:generated-sheet-001',
                uploadToken: 'tok-123',
                uploadURIs: ['https://blob.example.com/put-pdf'],
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    // 5. Binary PUT to blob storage
    if (u.hostname === 'blob.example.com' && opts.method === 'PUT') {
      return new Response('', { status: 201 });
    }
    // 6. Complete upload
    if (u.pathname.endsWith('/completeUpload') && opts.method === 'POST') {
      return new Response(JSON.stringify({ status: 200 }), { status: 200 });
    }
    // 7. Metadata PATCH + verification GET
    if (u.pathname.endsWith('/urn%3Aaaid%3Aaem%3Agenerated-sheet-001/metadata')) {
      if (opts.method === 'PATCH') {
        uploadedMetadata.push(...JSON.parse(opts.body));
        return new Response(JSON.stringify({ status: 200 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          assetId: 'urn:aaid:aem:generated-sheet-001',
          repositoryMetadata: {
            'repo:path': '/content/dam/marketing/sheets/college-lookbook.pdf',
            'repo:size': 8192,
          },
        }),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  // Step 1: Run resolve-worker
  const resolveJob = await resolveWorkerMain({
    jobId: 'res_test_1',
    source: { kind: 'collection', id: 'urn:cid:aem:01627298-234b-4444-9815-e4f641bca70b', name: 'College Branded' },
    tier: 'delivery',
    aemHost: 'https://author-p59602-e520244.adobeaemcloud.com',
    deliveryHost: 'https://delivery-p59602-e520244.adobeaemcloud.com',
    auth: mockAuth,
    fetchImpl: fakeFetch,
  });

  assert.equal(resolveJob.status, 'succeeded');
  assert.equal(resolveJob.result.resolvedCount, 6);

  // Step 2: Poll status with includeModel=true
  const statusRes = await statusMain({
    __ow_headers: { authorization: 'Bearer mock-ims-token', 'x-gw-ims-org-id': mockAuth.imsOrg },
    userId: mockAuth.userId,
    userHash: mockAuth.userHash,
    jobId: 'res_test_1',
    includeModel: 'true',
  });
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.body.model.assets.length, 6);

  // Step 3: Run generate-worker with mocked PDF Services conversion
  let capturedZip = null;
  const config = createDefaultConfig({
    header: { title: 'College Branded Lookbook', department: 'Athletics' },
    output: { quality: 'screen', targetFolder: { id: '', path: '/content/dam/marketing/sheets' } },
  });

  const genJob = await generateWorkerMain({
    jobId: 'gen_test_1',
    modelFileKey: resolveJob.result.modelFileKey,
    config,
    tier: 'author',
    aemHost: 'https://author-p59602-e520244.adobeaemcloud.com',
    deliveryHost: 'https://delivery-p59602-e520244.adobeaemcloud.com',
    auth: mockAuth,
    fetchImpl: fakeFetch,
    pdfConvertImpl: async ({ zipBuffer, pageWidthIn, pageHeightIn }) => {
      capturedZip = zipBuffer;
      assert.equal(pageWidthIn, 11);
      assert.equal(pageHeightIn, 8.5);
      return Buffer.from('%PDF-1.7 mock contact sheet pdf content');
    },
  });

  assert.equal(genJob.status, 'succeeded');
  assert.equal(genJob.result.aemAssetId, 'urn:aaid:aem:generated-sheet-001');
  assert.equal(genJob.result.aemPath, '/content/dam/marketing/sheets/college-lookbook.pdf');
  assert.ok(capturedZip && capturedZip.includes(Buffer.from('index.html')));
  // Verify CreatorTool marker was patched onto the uploaded PDF so future contact sheets exclude it
  const creatorPatch = uploadedMetadata.find((op) => op.path === '/xmp:CreatorTool');
  assert.equal(creatorPatch?.value, 'AEM Contact Sheet');
});

test('presets and prefs actions persist per-user settings', async () => {
  const headers = { authorization: 'Bearer mock-ims-token', 'x-gw-ims-org-id': mockAuth.imsOrg };

  const putPrefs = await prefsMain({
    __ow_headers: headers,
    __ow_method: 'PUT',
    userId: mockAuth.userId,
    lastOutputFolder: { id: 'f1', path: '/content/dam/25H2/newbalance' },
    lastLogo: { assetId: 'urn:aaid:aem:logo-1', path: '/content/dam/brand/logo.png', tier: 'author' },
  });
  assert.equal(putPrefs.statusCode, 200);

  const getPrefs = await prefsMain({ __ow_headers: headers, __ow_method: 'GET', userId: mockAuth.userId });
  assert.equal(getPrefs.body.lastOutputFolder.path, '/content/dam/25H2/newbalance');
  assert.equal(getPrefs.body.lastLogo.assetId, 'urn:aaid:aem:logo-1');

  const putPreset = await presetsMain({
    __ow_headers: headers,
    __ow_method: 'PUT',
    userId: mockAuth.userId,
    preset: { name: 'Weekly Studio Selects', isDefault: true, config: createDefaultConfig() },
  });
  assert.equal(putPreset.statusCode, 200);
  assert.equal(putPreset.body.presets.length, 1);
  assert.equal(putPreset.body.presets[0].isDefault, true);

  // Save a standalone watermark preset
  const putWmPreset = await presetsMain({
    __ow_headers: headers,
    __ow_method: 'PUT',
    userId: mockAuth.userId,
    watermarkPreset: {
      name: 'Embargo 2027 Diagonal',
      watermark: {
        enabled: true,
        text: 'EMBARGO UNTIL 2027',
        font: 'blocky',
        angle: 45,
        position: 'center',
        opacity: 40,
        coverage: 65,
      },
    },
  });
  assert.equal(putWmPreset.statusCode, 200);
  assert.equal(putWmPreset.body.watermarkPreset.name, 'Embargo 2027 Diagonal');
  assert.ok(putWmPreset.body.watermarkPresets.some((p) => p.name === 'Embargo 2027 Diagonal'));
});

test('renderNativePdfBuffer and renderHtml render watermark overlays with angle, position, opacity, and coverage', async () => {
  const model = buildSheetModel({
    rawAssets: collegeRaw.slice(0, 4),
    sourceLabel: 'Collection: College Branded',
  });
  const config = createDefaultConfig({
    watermark: {
      enabled: true,
      text: 'DO NOT DISTRIBUTE',
      font: 'blocky',
      angle: 45,
      position: 'bottom-right',
      opacity: 45,
      coverage: 70,
    },
  });
  const paginated = paginate(model, config);
  const html = renderHtml(paginated, {
    mode: 'preview',
    model,
    watermarkFontUrl: 'data:font/ttf;base64,AAEAAA==',
  });
  assert.match(html, /watermark-layer pos-bottom-right/);
  assert.match(html, /DO NOT DISTRIBUTE/);
  assert.match(html, /transform: rotate\(-45deg\)/);

  const pdfBuf = await renderNativePdfBuffer(paginated, { model });
  assert.ok(pdfBuf.byteLength > 1000);
  assert.equal(pdfBuf.subarray(0, 5).toString('utf8'), '%PDF-');
});

test('renderNativePdfBuffer produces a valid multi-page PDF Buffer from real fixture data', async () => {
  const model = buildSheetModel({
    rawAssets: collegeRaw.slice(0, 10),
    sourceLabel: 'Collection: College Branded',
    resolvedBy: 'pnam@adobe.com',
  });
  const config = createDefaultConfig({
    header: { title: 'Hertz Fall Shoot Contact Sheet', department: 'Brand Creative' },
    fields: [
      { key: 'common:title', label: 'Title', maxLines: 1, showLabel: false },
      { key: 'product:team', label: 'Team', maxLines: 1, showLabel: true },
    ],
  });
  const paginated = paginate(model, config);
  const pdfBuf = await renderNativePdfBuffer(paginated, { model });
  assert.ok(pdfBuf.byteLength > 1000);
  assert.equal(pdfBuf.subarray(0, 5).toString('utf8'), '%PDF-');
});

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
  const card1 = allOps.find((op) => op.ref === 'card_1');
  const card3 = allOps.find((op) => op.ref === 'card_3');
  const card1MetaOps = allOps.filter((op) => op.ref?.startsWith('meta_1_'));
  assert.ok(card1MetaOps.length >= 8);
  const lastMetaY = Math.max(...card1MetaOps.map((op) => op.placement.rect.y));
  assert.ok(
    card3.placement.rect.y > lastMetaY + 100,
    `Expected row 2 card (${card3.placement.rect.y}) to be well below row 1's last metadata line (${lastMetaY})`
  );
});

test('resolveUniqueFileName suffixes duplicate PDF filenames with incrementing sequence numbers', () => {
  assert.equal(resolveUniqueFileName('hertz-ads_2026-11-17.pdf', []), 'hertz-ads_2026-11-17.pdf');
  assert.equal(
    resolveUniqueFileName('hertz-ads_2026-11-17.pdf', ['hertz-ads_2026-11-17.pdf']),
    'hertz-ads_2026-11-17-1.pdf'
  );
  assert.equal(
    resolveUniqueFileName('hertz-ads_2026-11-17.pdf', [
      'hertz-ads_2026-11-17.pdf',
      'hertz-ads_2026-11-17-1.pdf',
      'hertz-ads_2026-11-17-2.pdf',
    ]),
    'hertz-ads_2026-11-17-3.pdf'
  );
});

test('Tier 1 enhancements: clickable deep links, approval status badges, and dark/grey page themes in HTML and PDF', async () => {
  const sampleRaw = [
    {
      ...collegeRaw[0],
      repositoryMetadata: {
        ...collegeRaw[0].repositoryMetadata,
        'repo:path': '/content/dam/26H2/citibank/2027-spring-campaign-shoot/shot1.jpg',
      },
      assetMetadata: { ...collegeRaw[0].assetMetadata, 'dam:assetStatus': 'approved' },
    },
    {
      ...collegeRaw[1],
      repositoryMetadata: {
        ...collegeRaw[1].repositoryMetadata,
        'repo:path': '/content/dam/26H2/citibank/2027-spring-campaign-shoot/shot2.jpg',
      },
      assetMetadata: { ...collegeRaw[1].assetMetadata, 'dam:assetStatus': 'rejected' },
    },
  ];

  const authorModel = buildSheetModel({
    rawAssets: sampleRaw,
    tier: 'author',
    aemHost: 'https://author-p59602-e520244.adobeaemcloud.com',
  });
  const deliveryModel = buildSheetModel({
    rawAssets: sampleRaw,
    tier: 'delivery',
    deliveryHost: 'https://delivery-p59602-e520244.adobeaemcloud.com',
  });

  assert.match(
    buildAssetDeepLink(authorModel.assets[0], authorModel),
    /^https:\/\/author-p59602-e520244\.adobeaemcloud\.com\/ui#\/aem\/assets\/detail\/content\/dam\//
  );
  assert.match(
    buildAssetDeepLink(deliveryModel.assets[0], deliveryModel),
    /^https:\/\/experience\.adobe\.com\/\?repoId=delivery-p59602-e520244\.adobeaemcloud\.com#\/assets\/contenthub\/assets\//
  );

  const config = createDefaultConfig({
    layout: {
      theme: 'dark',
      statusBadges: true,
      clickableLinks: true,
    },
  });
  const paginated = paginate(authorModel, config);
  const html = renderHtml(paginated, { mode: 'preview', model: authorModel });

  assert.match(html, /background: #18181b/);
  assert.match(html, /status-badge status-approved/);
  assert.match(html, /status-badge status-rejected/);
  assert.match(html, /class="thumb-link"/);

  const pdfBuf = await renderNativePdfBuffer(paginated, { model: authorModel });
  assert.ok(pdfBuf.byteLength > 1000);
  const loadedPdf = await PDFDocument.load(pdfBuf);
  const firstPage = loadedPdf.getPages()[0];
  const annots = firstPage.node.lookup(PDFName.of('Annots'));
  assert.equal(annots.size(), 2);
});
