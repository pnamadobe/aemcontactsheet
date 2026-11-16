// Generates interactive and print-ready HTML demos from the real p59602 fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSheetModel,
  createDefaultConfig,
  paginate,
  renderHtml,
} from '../packages/core/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const fixturesDir = path.join(rootDir, 'test/fixtures');
const outDir = path.join(rootDir, 'demo');
fs.mkdirSync(outDir, { recursive: true });

const collegeRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'college-branded-raw.json'), 'utf8'));
const smartCropRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'smart-crop-raw.json'), 'utf8'));

function svgDataUri(asset, index) {
  const palettes = [
    ['#1b4332', '#d8f3dc'],
    ['#1d3557', '#e0fbfc'],
    ['#7f1d1d', '#fee2e2'],
    ['#312e81', '#e0e7ff'],
    ['#78350f', '#fef3c7'],
    ['#064e3b', '#d1fae5'],
  ];
  const [fg, bg] = palettes[index % palettes.length];
  const label = (asset.values['product:team'] || asset.values['common:title'] || asset.name || '').slice(0, 24);
  const sub = (asset.values['product:appareltype'] || asset.values['common:orientation'] || asset.format || '').slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
    <rect width="480" height="360" fill="${bg}"/>
    <rect x="20" y="20" width="440" height="320" rx="12" fill="none" stroke="${fg}" stroke-opacity="0.25" stroke-width="2"/>
    <circle cx="240" cy="145" r="52" fill="${fg}" fill-opacity="0.14"/>
    <text x="240" y="152" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="22" font-weight="700" fill="${fg}">${escapeXml(sub.toUpperCase())}</text>
    <text x="240" y="255" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="18" font-weight="600" fill="${fg}">${escapeXml(label)}</text>
    <text x="240" y="285" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="13" fill="${fg}" fill-opacity="0.7">${escapeXml(asset.name)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const collegeModel = buildSheetModel({
  rawAssets: collegeRaw,
  source: { kind: 'collection', id: 'urn:cid:aem:01627298-234b-4444-9815-e4f641bca70b', name: 'College Branded' },
  sourceLabel: 'Collection: College Branded (p59602)',
  tier: 'delivery',
  aemHost: 'https://author-p59602-e520244.adobeaemcloud.com',
  deliveryHost: 'https://delivery-p59602-e520244.adobeaemcloud.com',
  resolvedBy: 'pnam@adobe.com',
});

const smartCropModel = buildSheetModel({
  rawAssets: smartCropRaw,
  source: { kind: 'folder', id: 'urn:aaid:aem:d702f918-9e02-41f6-bb7b-79257cb8301b', path: '/content/dam/smart-crop', includeSubfolders: false },
  sourceLabel: 'Folder: /content/dam/smart-crop (p59602)',
  tier: 'author',
  aemHost: 'https://author-p59602-e520244.adobeaemcloud.com',
  deliveryHost: 'https://delivery-p59602-e520244.adobeaemcloud.com',
  resolvedBy: 'pnam@adobe.com',
});

// 1. Static PDF-mode HTML sample (ready to zip and send to PDF Services HTML->PDF)
const sampleConfig = createDefaultConfig({
  header: {
    title: 'College Branded Collection — Fall Lookbook',
    date: '2026-11-16',
    department: 'Collegiate Sports Marketing',
    preparedBy: 'Peter Nam',
    project: 'NCAA 2026 Merch Assortment',
  },
  fields: [
    { key: 'common:title', label: 'Title', maxLines: 1, showLabel: false },
    { key: 'product:team', label: 'Team', maxLines: 1, showLabel: true },
    { key: 'product:appareltype', label: 'Apparel', maxLines: 1, showLabel: true },
    { key: 'dc:description', label: 'Description', maxLines: 2, showLabel: false },
  ],
  sort: {
    groupBy: { field: 'product:appareltype', dir: 'asc', newPagePerGroup: false },
    keys: [
      { field: 'product:team', dir: 'asc' },
      { field: 'repo:name', dir: 'asc' },
    ],
  },
  layout: {
    pageSize: 'letter',
    orientation: 'landscape',
    columns: 4,
    rows: 'auto',
    imageFit: 'fit',
    imageAspect: '4:3',
    pageNumbers: true,
    sequenceNumbers: true,
  },
});

const paginated = paginate(collegeModel, sampleConfig);
const pdfHtml = renderHtml(paginated, {
  mode: 'pdf',
  model: collegeModel,
  imageResolver: (asset) => svgDataUri(asset, asset.sequence || 0),
});
fs.writeFileSync(path.join(outDir, 'sample-contact-sheet.html'), pdfHtml);

// 2. Interactive studio harness that embeds @contactsheet/core and both real p59602 datasets
const coreBundle = `
const MODELS = ${JSON.stringify({ college: collegeModel, smartCrop: smartCropModel })};
`;
fs.writeFileSync(path.join(outDir, 'models-data.js'), coreBundle);

console.log(`Built demo/sample-contact-sheet.html (${paginated.totalPages} pages, ${paginated.totalAssets} assets)`);
