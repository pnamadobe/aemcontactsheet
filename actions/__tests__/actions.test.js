import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, PDFName } from 'pdf-lib';
import { buildZipBuffer } from '../lib/zip.js';
import { resolveUniqueFileName } from '../lib/aem.js';
import { renderNativePdfBuffer } from '../lib/pdf-native.js';
import { extractAuth, resolveAemHosts, validateAemHost } from '../lib/utils.js';
import { savePdfChunks } from '../lib/store.js';
import { main as resolveMain } from '../resolve/index.js';
import { main as resolveWorkerMain } from '../resolve-worker/index.js';
import { main as generateMain } from '../generate/index.js';
import { main as generateWorkerMain } from '../generate-worker/index.js';
import { main as statusMain } from '../status/index.js';
import { main as presetsMain } from '../presets/index.js';
import { main as prefsMain } from '../prefs/index.js';
import { buildAssetDeepLink, buildSheetModel, createDefaultConfig, paginate, renderHtml } from '../../packages/core/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test/fixtures');
const collegeRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'college-branded-raw.json'), 'utf8'));

process.env.CONTACTSHEET_LOCAL_STORE = '1';

const mockAuth = extractAuth({
  __ow_headers: {
    authorization: 'Bearer mock-ims-token',
    'x-gw-ims-org-id': '4A603BC061E191130A495FEF@AdobeOrg',
  },
  userId: 'pnam@adobe.com',
  userEmail: 'pnam@adobe.com',
});

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
    /^https:\/\/experience\.adobe\.com\/\?repoId=author-p59602-e520244\.adobeaemcloud\.com#\/assets\/detail\/content\/dam\//
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

test('Security & multi-tenancy: SSRF host allowlist, Author<->Delivery derivation, JWT claim integrity, and job/chunk ownership', async () => {
  // 1. SSRF host validation rejects non-AEM hosts, non-HTTPS schemes, and URL paths
  assert.throws(() => validateAemHost('https://evil.example.com'), /Disallowed AEM host/);
  assert.throws(() => validateAemHost('http://author-p12345-e67890.adobeaemcloud.com'), /Disallowed AEM host/);
  assert.throws(() => validateAemHost('https://author-p12345-e67890.adobeaemcloud.com/ steal'), /Invalid|Disallowed/);

  // 2. Multi-tenant Author <-> Delivery host auto-derivation
  const fromAuthor = resolveAemHosts({ aemHost: 'author-p11111-e22222.adobeaemcloud.com' });
  assert.equal(fromAuthor.aemHost, 'https://author-p11111-e22222.adobeaemcloud.com');
  assert.equal(fromAuthor.deliveryHost, 'https://delivery-p11111-e22222.adobeaemcloud.com');

  const fromContentHub = resolveAemHosts({ aemHost: 'https://delivery-p33333-e44444.adobeaemcloud.com' });
  assert.equal(fromContentHub.aemHost, 'https://author-p33333-e44444.adobeaemcloud.com');
  assert.equal(fromContentHub.deliveryHost, 'https://delivery-p33333-e44444.adobeaemcloud.com');

  // 3. Action endpoints return 400 INVALID_AEM_HOST on disallowed hosts
  const badHostRes = await resolveMain({
    __ow_headers: { authorization: 'Bearer mock-ims-token', 'x-gw-ims-org-id': mockAuth.imsOrg },
    source: { kind: 'folder', id: 'f1', path: '/content/dam/test' },
    aemHost: 'https://attacker.example.com',
  });
  assert.equal(badHostRes.statusCode, 400);
  assert.equal(badHostRes.body.error.code, 'INVALID_AEM_HOST');

  // 4. JWT claims cannot be overridden by caller-supplied params.imsOrg, params.userId, or params.userHash
  const fakeJwtPayload = Buffer.from(
    JSON.stringify({ org: 'REAL_ORG@AdobeOrg', user_id: 'alice@adobe.com', email: 'alice@adobe.com' })
  ).toString('base64url');
  const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${fakeJwtPayload}.sig`;
  const extracted = extractAuth({
    __ow_headers: { authorization: `Bearer ${fakeJwt}` },
    imsOrg: 'SPOOFED_ORG@AdobeOrg',
    userId: 'victim@adobe.com',
    userHash: '000000000000000000000000',
  });
  assert.equal(extracted.imsOrg, 'REAL_ORG@AdobeOrg');
  assert.equal(extracted.userId, 'alice@adobe.com');
  assert.notEqual(extracted.userHash, '000000000000000000000000');

  // 5. Job status and pdfJobId chunks enforce caller ownership (403 FORBIDDEN for other users/orgs)
  await savePdfChunks('res_test_1', Buffer.from('%PDF-1.7 test chunk data'));
  const ownerChunkRes = await statusMain({
    __ow_headers: { authorization: 'Bearer mock-ims-token', 'x-gw-ims-org-id': mockAuth.imsOrg },
    userId: mockAuth.userId,
    pdfJobId: 'res_test_1',
    chunk: 0,
  });
  assert.equal(ownerChunkRes.statusCode, 200);

  const otherUserChunkRes = await statusMain({
    __ow_headers: { authorization: `Bearer ${fakeJwt}` },
    pdfJobId: 'res_test_1',
    chunk: 0,
  });
  assert.equal(otherUserChunkRes.statusCode, 403);
  assert.equal(otherUserChunkRes.body.error.code, 'FORBIDDEN');

  const otherUserStatusRes = await statusMain({
    __ow_headers: { authorization: `Bearer ${fakeJwt}` },
    jobId: 'res_test_1',
  });
  assert.equal(otherUserStatusRes.statusCode, 403);

  // 6. Exchange /generate rejects internal-only output formats
  const unsupportedFmt = await generateMain({
    __ow_headers: { authorization: 'Bearer mock-ims-token', 'x-gw-ims-org-id': mockAuth.imsOrg },
    model: { assets: [], fields: [] },
    config: createDefaultConfig(),
    outputFormat: ' express '.trim(),
  });
  assert.equal(unsupportedFmt.statusCode, 400);
  assert.equal(unsupportedFmt.body.error.code, 'UNSUPPORTED_OUTPUT_FORMAT');
});

test('Multi-folder and mixed folder+file selection expands urn:aaid:aem folder IDs and deduplicates assets', async () => {
  const folderAAssets = collegeRaw.slice(0, 2).map((a, idx) => ({
    ...a,
    assetId: `urn:aaid:aem:folderA-${idx}`,
    repositoryMetadata: {
      ...a.repositoryMetadata,
      'repo:id': `urn:aaid:aem:folderA-${idx}`,
      'repo:path': `/content/dam/26H2/hbo/${a.repositoryMetadata['repo:name']}`,
    },
  }));
  const folderBAssets = collegeRaw.slice(2, 4).map((a, idx) => ({
    ...a,
    assetId: `urn:aaid:aem:folderB-${idx}`,
    repositoryMetadata: {
      ...a.repositoryMetadata,
      'repo:id': `urn:aaid:aem:folderB-${idx}`,
      'repo:path': `/content/dam/26H2/citibank/${a.repositoryMetadata['repo:name']}`,
    },
  }));
  const extraFileAsset = {
    ...collegeRaw[4],
    assetId: 'urn:aaid:aem:extra-file-1',
    repositoryMetadata: {
      ...collegeRaw[4].repositoryMetadata,
      'repo:id': 'urn:aaid:aem:extra-file-1',
      'repo:path': '/content/dam/26H2/standalone-shot.jpg',
    },
  };

  const fakeMultiSelectFetch = async (urlStr, opts = {}) => {
    const u = new URL(urlStr);
    if (u.pathname.endsWith('/assets/search') && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      const anc = body?.query?.[0]?.term?.['repositoryMetadata.repo:ancestors']?.[0];
      if (anc === 'urn:aaid:aem:folder-hbo') {
        return new Response(JSON.stringify({ hits: { results: folderAAssets }, cursor: null }), { status: 200 });
      }
      if (anc === 'urn:aaid:aem:folder-citi') {
        return new Response(JSON.stringify({ hits: { results: folderBAssets }, cursor: null }), { status: 200 });
      }
    }
    if (u.pathname.includes('/urn%3Aaaid%3Aaem%3Aextra-file-1/metadata')) {
      return new Response(JSON.stringify(extraFileAsset), { status: 200 });
    }
    if (u.pathname.includes('/urn%3Aaaid%3Aaem%3AfolderA-0/metadata')) {
      return new Response(JSON.stringify(folderAAssets[0]), { status: 200 });
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };

  const resJob = await resolveWorkerMain({
    jobId: 'res_multiselect_1',
    source: {
      kind: 'selection',
      includeSubfolders: false,
      items: [
        { id: 'urn:aaid:aem:folder-hbo', path: '/content/dam/26H2/hbo' },
        { id: 'urn:aaid:aem:folder-citi', path: '/content/dam/26H2/citibank' },
        { id: 'urn:aaid:aem:extra-file-1', path: '/content/dam/26H2/standalone-shot.jpg' },
        // Duplicate of an asset already inside folder-hbo — should be deduplicated
        { id: 'urn:aaid:aem:folderA-0', path: `/content/dam/26H2/hbo/${folderAAssets[0].repositoryMetadata['repo:name']}` },
      ],
    },
    tier: 'author',
    aemHost: 'https://author-p59602-e520244.adobeaemcloud.com',
    deliveryHost: 'https://delivery-p59602-e520244.adobeaemcloud.com',
    auth: mockAuth,
    fetchImpl: fakeMultiSelectFetch,
    returnModelInline: true,
  });

  assert.equal(resJob.status, 'succeeded');
  assert.equal(resJob.inlineModel.assets.length, 5);
  assert.equal(resJob.inlineModel.sourceLabel, 'hbo + citibank + 2 files');
});
