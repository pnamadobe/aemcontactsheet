# AEM Assets Contact Sheets

This project lets users create printable contact sheets (PDF) from a folder, collection, search result, or selection in AEM Assets view and Content Hub.

## Documents
- Research: [research/contact-sheet-feature-research.md](research/contact-sheet-feature-research.md)
- MVP architecture and design: [docs/mvp-architecture.md](docs/mvp-architecture.md)
- Spike findings on `p59602`: [docs/spike-findings.md](docs/spike-findings.md)

## Packages & Demo
- `@contactsheet/core` ([packages/core/](packages/core/)): shared zero-dependency ES module library for field discovery & coverage ranking (`fields.js`), model normalization (`model.js`), multi-level sorting & grouping (`sort.js`), page geometry & widow-safe pagination (`layout.js`), and HTML/CSS rendering (`render.js`).
- Real `p59602` fixtures ([test/fixtures/](test/fixtures/)):
  - `college-branded-raw.json` — 47 approved assets from Content Hub Delivery collection *College Branded* (`urn:cid:aem:01627298-234b-4444-9815-e4f641bca70b`)
  - `smart-crop-raw.json` — 36 assets from Author folder `/content/dam/smart-crop` (`urn:aaid:aem:d702f918-9e02-41f6-bb7b-79257cb8301b`)
- Interactive preview harness ([demo/index.html](demo/index.html)) and print-ready PDF-mode output ([demo/sample-contact-sheet.html](demo/sample-contact-sheet.html)).

```bash
npm test       # run unit & fixture tests
npm run demo   # rebuild demo/sample-contact-sheet.html and demo/models-data.js
npx serve .    # open http://localhost:3000/demo/index.html to try the live configurator
```
