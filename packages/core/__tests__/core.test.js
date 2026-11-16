import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTACT_SHEET_CREATOR_TOOL,
  NO_VALUE_GROUP_LABEL,
  buildSheetModel,
  computePageGeometry,
  createDefaultConfig,
  formatFieldValue,
  getSortableFields,
  humanizeFieldKey,
  paginate,
  renderHtml,
  sortAndGroup,
} from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');
const collegeRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'college-branded-raw.json'), 'utf8'));
const smartCropRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'smart-crop-raw.json'), 'utf8'));

test('buildSheetModel discovers and ranks fields by coverage and excludes previous contact sheets', () => {
  const withPrevSheet = [
    ...collegeRaw,
    {
      assetId: 'urn:aaid:aem:prev-sheet',
      repositoryMetadata: { 'repo:name': 'old-sheet.pdf', 'dc:format': 'application/pdf' },
      assetMetadata: { 'xmp:CreatorTool': CONTACT_SHEET_CREATOR_TOOL },
    },
  ];

  const model = buildSheetModel({
    rawAssets: withPrevSheet,
    source: { kind: 'collection', id: 'urn:cid:aem:01627298-234b-4444-9815-e4f641bca70b', name: 'College Branded' },
    sourceLabel: 'Collection: College Branded',
    tier: 'delivery',
  });

  assert.equal(model.assets.length, 47);
  assert.equal(model.warnings.length, 1);
  assert.match(model.warnings[0], /Excluded 1 previously generated contact sheet/);

  const discovered = model.fields.filter((f) => !f.common && !f.technical);
  const topKeys = discovered.slice(0, 12).map((f) => f.key);
  assert.ok(topKeys.includes('dc:title'));
  assert.ok(topKeys.includes('dc:description'));
  assert.ok(topKeys.includes('product:brand'));
  assert.ok(topKeys.includes('product:appareltype'));
  assert.ok(topKeys.includes('product:team'));

  const teamField = model.fields.find((f) => f.key === 'product:team');
  assert.ok(teamField.coverage > 0.7 && teamField.coverage < 1.0);
});

test('folder schema fields rank ahead of discovered fields in schema order', () => {
  const schemaFields = [
    { key: 'custom:sku', label: 'SKU Code', type: 'text' },
    { key: 'product:team', label: 'University / Team', type: 'text' },
  ];
  const model = buildSheetModel({
    rawAssets: collegeRaw,
    schemaFields,
  });
  const nonCommon = model.fields.filter((f) => !f.common);
  assert.equal(nonCommon[0].key, 'custom:sku');
  assert.equal(nonCommon[0].fromSchema, true);
  assert.equal(nonCommon[1].key, 'product:team');
  assert.equal(nonCommon[1].label, 'University / Team');
});

test('getSortableFields includes all common fields plus user-selected printed metadata fields', () => {
  const model = buildSheetModel({ rawAssets: collegeRaw });
  const printed = [
    { key: 'product:team', label: 'Team' },
    { key: 'custom:shotAngle', label: 'Shot Angle' },
  ];
  const sortable = getSortableFields(model.fields, printed);
  const keys = sortable.map((f) => f.key);
  assert.ok(keys.includes('repo:name'));
  assert.ok(keys.includes('repo:createDate'));
  assert.ok(keys.includes('product:team'));
  assert.ok(keys.includes('custom:shotAngle'));
  const customEntry = sortable.find((f) => f.key === 'custom:shotAngle');
  assert.equal(customEntry.section, 'printed');
});

test('natural sort, multi-level sort, and empty-values-always-last in both asc and desc', () => {
  const raw = [
    { assetId: '1', repositoryMetadata: { 'repo:name': 'img_10.jpg', 'repo:size': 200 }, assetMetadata: { 'product:team': 'Bryant' } },
    { assetId: '2', repositoryMetadata: { 'repo:name': 'img_2.jpg', 'repo:size': 300 }, assetMetadata: { 'product:team': 'Bryant' } },
    { assetId: '3', repositoryMetadata: { 'repo:name': 'img_1.jpg', 'repo:size': 100 }, assetMetadata: {} },
    { assetId: '4', repositoryMetadata: { 'repo:name': 'img_3.jpg', 'repo:size': 150 }, assetMetadata: { 'product:team': 'Adams' } },
  ];
  const model = buildSheetModel({ rawAssets: raw });

  // Ascending by product:team, then natural filename asc -> empty team ('img_1.jpg') must be LAST
  const asc = sortAndGroup(model, {
    sort: {
      keys: [
        { field: 'product:team', dir: 'asc' },
        { field: 'repo:name', dir: 'asc' },
      ],
    },
  });
  assert.deepEqual(
    asc.groups[0].assets.map((a) => a.name),
    ['img_3.jpg', 'img_2.jpg', 'img_10.jpg', 'img_1.jpg']
  );

  // Descending by product:team -> empty team STILL LAST
  const desc = sortAndGroup(model, {
    sort: {
      keys: [
        { field: 'product:team', dir: 'desc' },
        { field: 'repo:name', dir: 'asc' },
      ],
    },
  });
  assert.deepEqual(
    desc.groups[0].assets.map((a) => a.name),
    ['img_2.jpg', 'img_10.jpg', 'img_3.jpg', 'img_1.jpg']
  );
});

test('grouping orders groups, puts (No value) last, and numbers sequences continuously', () => {
  const model = buildSheetModel({ rawAssets: collegeRaw });
  const grouped = sortAndGroup(model, {
    sort: {
      groupBy: { field: 'product:appareltype', dir: 'asc', newPagePerGroup: false },
      keys: [
        { field: 'product:team', dir: 'asc' },
        { field: 'repo:name', dir: 'asc' },
      ],
    },
  });

  assert.equal(grouped.grouped, true);
  assert.equal(grouped.totalAssets, 47);
  const groupLabels = grouped.groups.map((g) => g.valueLabel);
  assert.deepEqual(groupLabels, ['hoodie', 'sneaker', 'sneakers', 'sweatshirt']);
  assert.equal(grouped.groups[0].assets[0].sequence, 1);
  const lastGroup = grouped.groups[grouped.groups.length - 1];
  assert.equal(lastGroup.assets[lastGroup.assets.length - 1].sequence, 47);

  // Grouping on product:team where some sneakers have no team -> '(No value)' group is last
  const byTeam = sortAndGroup(model, {
    sort: {
      groupBy: { field: 'product:team', dir: 'asc' },
      keys: [{ field: 'repo:name', dir: 'asc' }],
    },
  });
  const lastTeamGroup = byTeam.groups[byTeam.groups.length - 1];
  assert.equal(lastTeamGroup.valueLabel, NO_VALUE_GROUP_LABEL);
  assert.equal(lastTeamGroup.empty, true);
});

test('paginate never leaves a group band widowed at the bottom of a page and renders matching HTML pages', () => {
  const model = buildSheetModel({
    rawAssets: collegeRaw,
    sourceLabel: 'Collection: College Branded',
    resolvedBy: 'pnam@adobe.com',
  });
  const config = createDefaultConfig({
    header: {
      title: 'College Branded Lookbook',
      department: 'Sports Marketing',
      preparedBy: 'Peter Nam',
    },
    fields: [
      { key: 'common:title', label: 'Title', maxLines: 1, showLabel: false },
      { key: 'product:team', label: 'Team', maxLines: 1, showLabel: true },
      { key: 'product:appareltype', label: 'Type', maxLines: 1, showLabel: true },
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
      imageAspect: '3:4',
    },
  });

  const paginated = paginate(model, config);
  assert.ok(paginated.totalPages >= 3);
  assert.equal(paginated.totalAssets, 47);

  // Verify no page ends with a group-band block
  for (const page of paginated.pages) {
    const lastBlock = page.blocks[page.blocks.length - 1];
    assert.notEqual(lastBlock.type, 'group-band', `Page ${page.pageNumber} ended with a widowed group-band`);
  }

  const html = renderHtml(paginated, { model, mode: 'pdf' });
  const pageMatches = html.match(/<section class="page"/g) || [];
  assert.equal(pageMatches.length, paginated.totalPages);
  assert.match(html, /College Branded Lookbook/);
  assert.match(html, /Apparel type: hoodie/);
});

test('smart-crop author fixture resolves 36 assets and formats tags and dimensions cleanly', () => {
  const model = buildSheetModel({
    rawAssets: smartCropRaw,
    sourceLabel: '/content/dam/smart-crop',
    tier: 'author',
  });
  assert.equal(model.assets.length, 36);
  const first = model.assets[0];
  const dimDef = model.fields.find((f) => f.key === 'common:dimensions');
  const tagDef = model.fields.find((f) => f.key === 'xcm:keywords');
  assert.equal(formatFieldValue(first.values['common:dimensions'], dimDef), '1000 × 662');
  assert.equal(formatFieldValue(first.values['xcm:keywords'], tagDef), 'Landscape');
  assert.equal(humanizeFieldKey('product:appareltype'), 'Apparel type');
  assert.equal(humanizeFieldKey('xdm:vehicleClass'), 'Vehicle Class');
  assert.equal(humanizeFieldKey('hertz:modelYear'), 'Model Year');
  assert.equal(humanizeFieldKey('brand:sku_id'), 'SKU ID');
});
