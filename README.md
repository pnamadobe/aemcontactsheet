# AEM Assets Contact Sheets

This project lets users create printable contact sheets (PDF) from a folder, collection, search result, or selection in AEM Assets view and Content Hub.

## Documents
- Research: [research/contact-sheet-feature-research.md](research/contact-sheet-feature-research.md)
- MVP architecture and design: [docs/mvp-architecture.md](docs/mvp-architecture.md)
- Spike findings on `p59602`: [docs/spike-findings.md](docs/spike-findings.md)

## Packages & Demo
- `@contactsheet/core` ([packages/core/](packages/core/)): shared zero-dependency ES module library for field discovery & coverage ranking (`fields.js`), model normalization (`model.js`), multi-level sorting & grouping (`sort.js`), page geometry & widow-safe pagination (`layout.js`), and HTML/CSS rendering (`render.js`).
- App Builder actions ([actions/](actions/)):
  - `resolve` + `resolve-worker` — bulk-resolves folders (`POST /adobe/experimental/metaall-expires-20991231/assets/search`), collections (Author & Delivery), and selections into a normalized `SheetModel`.
  - `generate` + `generate-worker` — fetches Dynamic Media or static renditions by asset ID, packages a self-contained ZIP (`index.html` + images), converts via Adobe PDF Services HTML→PDF, uploads to AEM Author (`POST /adobe/assets` → PUT → `completeUpload` → `PATCH /metadata` with `xmp:CreatorTool`), and verifies the saved asset.
  - `status`, `browse` (folder browser & logo image picker), `presets` (personal presets), and `prefs` (remembered output folder & header logo).
- App Builder UI extensions ([src/](src/)):
  - `aem/assets/assetsview/1` ([src/aem-assets-assetsview-1/](src/aem-assets-assetsview-1/)) — `headerMenu`, `actionBar`, and `quickActions` in Assets View.
  - `aem/assets/contenthub/1` ([src/aem-assets-contenthub-1/](src/aem-assets-contenthub-1/)) — `card` (collection tiles) and `selectionBar` (bulk selection) in Content Hub.
  - Shared React configurator & live preview ([src/shared-ui/components/ContactSheetDialog.js](src/shared-ui/components/ContactSheetDialog.js)).
- Real `p59602` fixtures ([test/fixtures/](test/fixtures/)):
  - `college-branded-raw.json` — 47 approved assets from Content Hub Delivery collection *College Branded* (`urn:cid:aem:01627298-234b-4444-9815-e4f641bca70b`)
  - `smart-crop-raw.json` — 36 assets from Author folder `/content/dam/smart-crop` (`urn:aaid:aem:d702f918-9e02-41f6-bb7b-79257cb8301b`)
- Interactive preview harness ([demo/index.html](demo/index.html)) and print-ready PDF-mode output ([demo/sample-contact-sheet.html](demo/sample-contact-sheet.html)).

## Commands
```bash
npm test                                      # run core & action unit/integration tests
npm run demo                                  # rebuild demo/sample-contact-sheet.html and demo/models-data.js
aio app use 547DimSquid-767251-Stage.json     # switch to Stage workspace (767251-547dimsquid-stage)
aio app use 547DimSquid-767251-Production.json # switch to Production workspace (767251-547dimsquid)
```
