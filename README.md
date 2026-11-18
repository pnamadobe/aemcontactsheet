# AEM Assets Contact Sheets

An Adobe App Builder application for **AEM Assets View (`aem/assets/assetsview/1`)** and **AEM Content Hub (`aem/assets/contenthub/1`)** that generates customizable, print-ready **PDF Contact Sheets** (saved back to AEM Assets and immediately downloadable).

> **Two Build Profiles from One Codebase:**
> - **Adobe Exchange Build (default — `app.config.yaml`):** Pure PDF Contact Sheet extension for **Adobe Plugin Developers** IMS Org / Adobe Exchange distribution. Verified by `npm run check:exchange` to contain zero internal-only endpoints or client IDs.
> - **Internal Demo Build (`internal/app.config.demo.yaml`):** Adds direct **Adobe Firefly Boards** and **Adobe Express (`HzJSON` v1)** exports for internal customer demos (`npm run deploy:demo`).

## Demo Video & Overview

- **Watch the Demo on YouTube:** [https://youtu.be/wgfEXvkFBYM](https://youtu.be/wgfEXvkFBYM)

[![AEM Assets Contact Sheets Demo](docs/images/contact-sheet-modal.png)](https://youtu.be/wgfEXvkFBYM)

---

## Features & Capabilities

### 1. Dual Entry Points: AEM Assets View & Content Hub
- **Unified Extension Bundle (`src/shared-ui/unified-entry.js`):** Single `register()` entry point supporting both **AEM Assets View** (`aem/assets/assetsview/1`: `headerMenu`, `actionBar`, `quickActions`) and **AEM Content Hub** (`aem/assets/contenthub/1`: `card` collection tiles, `selectionBar` multi-selection).
- **Content Hub Fast Initialization:** Automatically detects `tier = delivery`, skips Assets View–only host RPC calls (`getCurrentUserProfile`, `getAemHost`) that would time out in Content Hub, decodes user claims from the IMS JWT, and normalizes `x-api-key` for Author archival uploads.
- **Recursive Subfolder Toggle (`Include subfolders`):** When launched on any folder in Assets View, a top-bar **Include subfolders** checkbox pill dynamically re-resolves all descendant assets across nested subfolders (`repo:ancestors`) in place without losing your current configuration.

---

### 2. Adobe Spectrum 2 Native UI & Responsive Live Preview
- **Spectrum 2 Inspector & Stage (`src/shared-ui/components/ContactSheetDialog.js`):**
  - Clean `56px` Spectrum 2 top bar with AEM grid badge, source breadcrumb pill, asset count badge, preset selector, and action pills (**Print**, **Save PDF to AEM**, **Cancel**).
  - `360px` Left Inspector Rail paired with a responsive right-hand preview stage.
- **Responsive Viewport Page Scaling (`packages/core/render.js`):**
  - Uses a `ResizeObserver` inside the preview iframe to compute `--cs-scale = (availableWidth - 64) / (pageWidthIn * 96)`, scaling any paper size (`Letter`, `A4`, `Legal`, `Tabloid`, `A3`, portrait or landscape) smoothly to the available canvas width after accounting for the left sidebar, with **Fit to width**, **75%**, and **100%** zoom controls.
  - Includes `@media print { transform: none !important }` so browser printing outputs exact 1:1 physical inches.
- **Universal Preview Thumbnails (Approved, Rejected, Draft & Unpublished Assets):**
  - Loads authenticated Dynamic Media JPEGs (`?width=350&quality=75`) for approved/published assets and falls back to `GET /browse?mode=thumbnails` (fetching AEM's compact `cq5dam.thumbnail.140.100.png` rendition in 5-asset batches well under OpenWhisk's 1 MB limit) so unapproved, rejected, and unpublished Author assets all display thumbnails in the Live Preview.

---

### 3. Sheet Header & Centered, Top-Aligned Brand Logo
- **Header Fields:** Custom **Title**, **Date**, **Department**, **Prepared by**, **Project / Shoot**, plus automatic **Source** path and **Asset Count**.
- **Inline Brand Logo Picker with DAM Search & Small Thumbnails (`actions/browse/index.js`):**
  - Opens inline directly underneath the **Brand Logo** field, starting in the current shoot's parent folder (e.g., `/content/dam/26H2/hertz` where `brand/hertz-logo-black.png` lives).
  - Includes a DAM-wide search input (`Search logo across DAM (e.g. hertz, logo)…`) and embeds AEM's pre-generated small thumbnails (`cq5dam.thumbnail.140.100.png` / `48.48.png`) as `data:` URLs next to each image filename.
- **Centered & Top-Aligned Placement:**
  - The selected Brand Logo is **horizontally centered and top-aligned** across the Live Preview (3-column CSS Grid `.header-center`), HTML-to-PDF (`packages/core/render.js`), and native vector PDF (`actions/lib/pdf-native.js`), and is remembered per user (`prefs`).

---

### 4. Metadata Captions, Multi-Level Sorting & Section Grouping
- **Friendly Metadata Discovery & Coverage Ranking (`packages/core/fields.js`):**
  - Discovers all `assetMetadata` and `repositoryMetadata` fields across resolved assets, ranks them by population coverage, and maps raw property names to human-readable labels (`Vehicle Class`, `Campaign Name`, `Dimensions`, `File Size`, `Orientation`, `Folder`—never raw `xdm:*` or `repo:*` IDs).
- **Per-Thumbnail Captions:**
  - Configure which fields print beneath each thumbnail, with **1–3 line clamping** and an optional **Label** prefix toggle per field.
- **Multi-Level Natural Sort & Widow-Safe Grouping (`packages/core/sort.js`, `packages/core/layout.js`):**
  - Natural alphanumeric sorting (`img_2.jpg` before `img_10.jpg`) with empty values always sorted last in both ascending (`A → Z`) and descending (`Z → A`) order.
  - Primary and Secondary sort keys across all common fields and user-selected printed metadata fields.
  - Optional **Group into sections by** any groupable field (`Folder`, `Orientation`, `Vehicle Class`, `Team`, `Apparel Type`, etc.) with styled section header banners that are never left widowed at the bottom of a page.

---

### 5. Watermarks & Standalone Watermark Presets
- **Configurable Watermark Overlay (`packages/core/layout.js`, `packages/core/render.js`, `actions/lib/pdf-native.js`):**
  - **Watermark Text:** Custom text input (defaults to `CONFIDENTIAL`).
  - **Font Family (System Fonts + Automatic AEM DAM Font Discovery):**
    - Defaults to a **Blocky Impact** font (`Impact, "Arial Black", "Helvetica Neue Condensed Black"`), plus *Bold Sans*, *Condensed Display*, *Classic Serif Bold*, and *Monospace Stamp*.
    - Automatically discovers custom `.ttf`, `.otf`, `.woff`, and `.woff2` fonts from **`/content/dam/fonts`** AND searches across the entire DAM by `dc:format` (`font/ttf`, `font/otf`, `font/woff`, `font/woff2`) so fonts stored under any folder convention (e.g., `/content/dam/.../Document fonts/Gotham-Black.otf`) appear automatically in the dropdown.
    - Renders custom DAM fonts via `@font-face` in the Live Preview and embeds `.ttf`/`.otf` binaries directly into the vector PDF via `@pdf-lib/fontkit`.
  - **Position:** `Center` (default), `Top Left`, `Top Right`, `Bottom Left`, or `Bottom Right`.
  - **Angle:** Preset angles (`45° Diagonal ↗` default, `-45° Diagonal ↘`, `0° Horizontal`, `30°`, `-30°`, `60°`, `-60°`, `90° Vertical`) plus a numeric degree input (`-90°` to `90°`).
  - **Opacity & Surface Coverage:** Sliders for **Opacity** (`10%–90%`, default `35%`) and **Asset Coverage** (`20%–90%` of thumbnail span, default `60%`).
  - **Dual-Contrast Grey:** Rendered in neutral mid-grey (`#888888` / `rgb(0.56, 0.56, 0.56)`) with a subtle dark/light halo so watermarks are legible on **both pure white and pure black assets**.
- **Standalone Watermark Presets (`actions/presets/index.js`):**
  - Includes starter watermark presets (`CONFIDENTIAL (45° Center)`, `FPO — DO NOT DISTRIBUTE`, `DRAFT (Bottom Right)`) and a dedicated **Save preset** button in the Watermark section so watermark presets can be saved and applied independently of layout presets.

---

### 6. Page Layout, Themes, Status Badges & Clickable Deep Links
- **Layout Controls:** Paper size (`Letter`, `A4`, `Legal`, `Tabloid`, `A3`), Orientation (`Landscape`, `Portrait`), Grid columns (`2–6`), Thumbnail aspect ratio (`4:3`, `1:1`, `3:2`, `16:9`, `3:4`), Thumbnail fit (`Contain`, `Cover`), Resolution (`Screen 150 ppi`, `Print 300 ppi`), Page numbers, and Asset sequence `#`.
- **Page Themes (`THEME_PALETTES`):**
  - **Clean White (`#ffffff`)** — Default
  - **Photographer Dark (`#18181b`)** — Charcoal canvas with `#27272a` frames and light text for color-accurate photo/video review
  - **Neutral Proofing Grey (`#52525b`)** — 50% neutral proofing surround with `#3f3f46` frames
- **Approval Status Badges (`Status badges`):**
  - Overlays a Spectrum 2 status pill in the top-right corner of each thumbnail in both the Live Preview and PDF (`APPROVED` green `#05834e`, `REJECTED` red `#d73220`, `PENDING` / `DRAFT` amber `#cb6f10`).
- **Clickable Deep Links in PDF & Preview (`Clickable AEM links`):**
  - Attaches a native PDF `URI` link annotation (`Subtype: 'Link'`) over every thumbnail cell in `pdf-lib` (and `<a>` links in preview):
    - **From AEM Assets View (`tier = author`):** Opens `https://experience.adobe.com/?repoId=author-p59602-e520244.adobeaemcloud.com#/assets/detail/content/dam/...`
    - **From AEM Content Hub (`tier = delivery`):** Opens `https://experience.adobe.com/?repoId=delivery-p59602-e520244.adobeaemcloud.com#/assets/contenthub/assets/urn:aaid:aem:...`

---

### 7. Save PDF to AEM, Sequence Deduplication, Read-Only Fallback & Instant (`< 1s`) Download
- **Save to AEM Assets (`actions/lib/aem.js`, `actions/generate-worker/index.js`):**
  - In **Assets View**, saves to the user's selected AEM folder (remembered in `prefs`, defaulting to the current folder or `/content/dam/contact-sheets/{yyyy}/{mm}/`).
  - In **Content Hub**, saves an archival copy to `/content/dam/contact-sheets/content-hub/{yyyy}/{mm}/` on AEM Author.
  - Patches `xmp:CreatorTool = "AEM Contact Sheet"` onto every generated PDF so future contact sheets automatically exclude previously generated contact sheet PDFs.
- **Duplicate Filename Sequence Suffixing (`resolveUniqueFileName`):**
  - Uses `{title-slug}_{yyyy-mm-dd}.pdf` and automatically appends incrementing sequence numbers (`-1.pdf`, `-2.pdf`, `-3.pdf`, …) when a file with the same name already exists in the folder (including an automatic conflict-retry loop around `POST /adobe/assets`).
- **Graceful Read-Only / No-Write-Permission Fallback:**
  - If an Author user lacks write access to a restricted source folder, automatically falls back to `/content/dam/contact-sheets/{yyyy}/{mm}/`.
  - If the user has **no write permissions in AEM at all**, the PDF is still generated for direct download (`✓ Contact Sheet Ready for Download`) via `inlinePdfBase64` ($\le 520\text{ KB}$) or `42 KB` App Builder `State` chunks ($> 520\text{ KB}$).
- **Instant (`< 1s`) PDF Download Readiness (`actions/status/index.js`):**
  - For PDFs $\le 520\text{ KB}$, `inlinePdfBase64` is returned directly in the `/generate` response (`0.0s` wait).
  - For larger PDFs ($> 520\text{ KB}$), `/status` streams `480 KB` byte-range slices (`Range: bytes=start-end`) in parallel from AEM's `/adobe/assets/{id}/original/as/{fileName}`—enabling **Download PDF** in **under 1 second** without waiting ~60s for AEM's Smart Tagging / search indexer.

---

## Internal Demo Integrations (`internal/` — Not Included in Adobe Exchange Build)

When built or deployed with `npm run build:demo` or `npm run deploy:demo` (`scripts/with-demo-config.js`), the application swaps in `internal/app.config.demo.yaml` and `internal/ui/cloud-canvas-slot.js` to enable two internal demo-only cloud-canvas integrations:

### 8. Export to Adobe Firefly Boards (Infinite Canvas) & Cross–IMS Org Support (`internal/actions/lib/firefly-boards.js`)
- **Board Creation:**
  - Creates a new Firefly Board via the Adobe Federated MCP Gateway (`https://adobe-copilot-prod.adobe.io/mcp` → `boards_create_new_board`) or direct `aura-doc-service` V2 REST (`https://hz-aura-doc-service.adobe.io/v2/create-new-board`, `x-api-key: aura_webapp`).
- **Full / Highest Resolution Images:**
  - Enriches Author assets with pre-signed `downloadUrl`s and passes full-resolution original JPEG/PNG/WebP URLs (`presignedUrl`) directly to `aura-doc-service`.
  - For Content Hub (`delivery`) or non-web formats (PSD/TIFF), fetches high-resolution renditions (`targetPx: 2048, quality: 'print'`).
- **Separate Stacked Editable Metadata Lines & Dynamic Grid Expansion:**
  - Places each header line, group banner, and metadata field below an asset as its own separate, individually editable text line (`height: 0.01` artboard so no white underline bar appears) and dynamically expands each grid row's height based on the number of printed metadata lines.
- **Cross–IMS Org Support:**
  - Auto-detects the human-readable IMS Org name when pasting a Bearer token from another Firefly Boards or Adobe Express tab (`copy(window.adobeIMS.getAccessToken().token)`) and persists saved target org profiles in `internal/actions/prefs/index.js`.

### 9. Export to Adobe Express (`internal/actions/lib/adobe-express.js`)
- **Direct Multi-Page Horizon JSON (`HzJSON` v1) Export:**
  - Converts the paginated contact sheet (`paginated.pages`, `geometry`, `THEME_PALETTES`) into a multi-page **Horizon JSON (`HzJSON` v1)** document where each contact sheet page is an `artboard` (`96 px/in`) containing independent, editable Express scene nodes (page background, header, centered logo, section group banners, aspect-ratio-preserving thumbnail `BitmapFill` nodes backed by embedded `data:image/...;base64,...` resources, status badges, rotated watermarks, and `EXPRESS_TEXT_SCALE = 96 / 72` normalized captions).
  - Submits the `HzJSON` document to Sensei CPF (`POST https://sensei.adobe.io/services/v2/predict`), shares the created `urn:aaid:sc:...` document via `invitations.adobe.io`, and provides a 1-click **Copy Adobe Express Link** button (`https://new.express.adobe.com/id/urn:aaid:sc:...`) with an automatic vector-PDF fallback if the token lacks Express scopes.

---

## Repository Structure & Documentation

- `packages/core/`: `@contactsheet/core` shared library (`fields.js`, `model.js`, `sort.js`, `layout.js`, `render.js`) and unit tests (`packages/core/__tests__/core.test.js`).
- `actions/`: Adobe Exchange I/O Runtime actions (`resolve`, `resolve-worker`, `generate`, `generate-worker`, `status`, `browse`, `presets`, `prefs`) and shared backend libraries (`actions/lib/aem.js`, `actions/lib/pdf-native.js`, `actions/lib/pdf-services.js`, `actions/lib/store.js`, `actions/lib/zip.js`).
- `src/`: Unified UI extension entry (`src/shared-ui/unified-entry.js`), Exchange cloud-canvas stub (`src/shared-ui/cloud-canvas-slot.js`), and Spectrum 2 React modal (`src/shared-ui/components/ContactSheetDialog.js`) for both `aem/assets/assetsview/1` and `aem/assets/contenthub/1`.
- `internal/`: Internal demo-only Firefly Boards & Adobe Express libraries (`internal/actions/lib/firefly-boards.js`, `internal/actions/lib/adobe-express.js`), action wrappers (`internal/actions/generate`, `internal/actions/generate-worker`, `internal/actions/prefs`), UI slot (`internal/ui/cloud-canvas-slot.js`), manifest (`internal/app.config.demo.yaml`), tests (`internal/__tests__/internal.test.js`), and research docs:
  - [Firefly Boards MCP & `aura-doc-service` Research (`internal/firefly-boards-mcp-research.md`)](internal/firefly-boards-mcp-research.md)
  - [Adobe Express Export (`HzJSON` v1 + Sensei CPF) Research & Architecture (`internal/adobe-express-hzjson-research.md`)](internal/adobe-express-hzjson-research.md)
- `docs/`:
  - [Adobe Exchange vs. Internal Demo Build Architecture & Deployment Guide (`docs/exchange-vs-demo-architecture.md`)](docs/exchange-vs-demo-architecture.md)
  - [Administrator Setup & Configuration Guide (`docs/admin-setup-guide.md`)](docs/admin-setup-guide.md)
  - [Privacy, Security & Data Handling (`docs/privacy-and-data-handling.md`)](docs/privacy-and-data-handling.md)
  - [MVP Architecture & Design (`docs/mvp-architecture.md`)](docs/mvp-architecture.md)
  - [M0 Spike Findings (`docs/spike-findings.md`)](docs/spike-findings.md)
  - [Tier 1 Enhancements Plan (`docs/tier1-enhancements-plan.md`)](docs/tier1-enhancements-plan.md)
- `research/`: [Competitor, Customer & Adobe Ecosystem Research (`research/contact-sheet-feature-research.md`)](research/contact-sheet-feature-research.md)

---

## Build Profiles: Adobe Exchange vs. Internal Demo

| Component | Adobe Exchange Build (Default) | Internal Demo Build (`internal/` Overlay) |
|---|---|---|
| **Target IMS Org** | **Adobe Plugin Developers** (`aemcontactsheets-393012`) | **Adobe Internal Peter Nam** (`547DimSquid-767251`) |
| **App Builder Manifest** | `app.config.yaml` | `internal/app.config.demo.yaml` |
| **Supported Outputs** | `pdf` (Save to AEM + Download) | `pdf`, `boards` (Firefly Boards), `express` (Adobe Express) |
| **`POST /generate` Action** | `actions/generate/index.js` | `internal/actions/generate/index.js` |
| **`generate-worker` Action** | `actions/generate-worker/index.js` | `internal/actions/generate-worker/index.js` |
| **`GET/PUT /prefs` Action** | `actions/prefs/index.js` (`lastOutputFolder`, `lastLogo`) | `internal/actions/prefs/index.js` (+ `savedBoardsProfiles`) |
| **UI Cloud-Canvas Slot** | `src/shared-ui/cloud-canvas-slot.js` (no-op stub) | `internal/ui/cloud-canvas-slot.js` (Boards/Express buttons & Org switcher) |
| **Automated Readiness Gate** | `scripts/check-exchange.js` (`npm run check:exchange`) | Swapped and restored via `scripts/with-demo-config.js` |

See [docs/exchange-vs-demo-architecture.md](docs/exchange-vs-demo-architecture.md) for the full architectural diagram and forbidden-pattern audit list.

---

## Testing, Verification & Deployment Commands

### 1. Run Unit & Integration Tests
```bash
# Run public Adobe Exchange test suite (core + public actions + security/multi-tenancy)
npm test

# Run all unit & integration tests (core + public actions + internal Firefly Boards & Adobe Express)
npm run test:all
```

### 2. Build & Deploy for Adobe Exchange (`Adobe Plugin Developers` — `aemcontactsheets-393012`)
```bash
# Clean build app.config.yaml + verify zero internal endpoints/keys/demo hosts in src/, actions/, packages/, and dist/
npm run build:exchange

# Run the standalone Exchange verification check at any time
npm run check:exchange

# Build, verify, and deploy to Adobe Plugin Developers Stage (aemcontactsheets-393012-Stage.json)
npm run deploy:exchange:stage

# Build, verify, and deploy to Adobe Plugin Developers Production (aemcontactsheets-393012-Production.json)
npm run deploy:exchange
```

### 3. Build & Deploy Internal Customer Demo (`Adobe Internal Peter Nam` — `547DimSquid-767251`)
```bash
# Build with Firefly Boards & Adobe Express enabled (restores Exchange files afterward)
npm run build:demo

# Automatically selects 547DimSquid-767251-Production.json, deploys full demo build, and restores Exchange files
npm run deploy:demo -- --no-publish --no-log-forwarding-update
```
