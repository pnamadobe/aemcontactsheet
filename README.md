# AEM Assets Contact Sheets & Firefly Boards Exporter

An Adobe App Builder application for **AEM Assets View (`aem/assets/assetsview/1`)** and **AEM Content Hub (`aem/assets/contenthub/1`)** that generates customizable, print-ready **PDF Contact Sheets** (saved back to AEM Assets and immediately downloadable) and exports interactive contact-sheet grids directly to **Adobe Firefly Boards** (infinite canvas).

---

## Key Capabilities

1. **Dual Entry Points (Assets View & Content Hub):**
   - Unified extension registration (`src/shared-ui/unified-entry.js`) supporting both `aem/assets/assetsview/1` (`headerMenu`, `actionBar`, `quickActions`) and `aem/assets/contenthub/1` (`card` collection tiles, `selectionBar`).
   - Fast initialization on Content Hub (`tier=delivery`) that avoids Assets View–only RPC calls (`getCurrentUserProfile` / `getAemHost`) and reads user claims directly from the IMS JWT.
2. **Adobe Spectrum 2 Native Modal & Responsive Live Preview:**
   - Spectrum 2 light-theme inspector rail (`360px`) + responsive right-hand page stage (`src/shared-ui/components/ContactSheetDialog.js`).
   - Dynamic `ResizeObserver` page scaling (`--cs-scale` in `packages/core/render.js`) that fits any paper size (`Letter`, `A4`, `Legal`, `Tabloid`, `A3`, portrait or landscape) to the available canvas width without horizontal scrollbars, plus `Fit to width`, `75%`, and `100%` zoom controls.
   - Displays thumbnails for **all** assets in the Live Preview—both published/approved Delivery assets and unapproved/rejected/draft Author assets (via `GET /browse?mode=thumbnails`).
3. **Customizable Sheet Header & Centered, Top-Aligned Brand Logo:**
   - Configurable Title, Date, Department, Prepared by, Project/Shoot, Notes, auto source path, and asset count.
   - Inline **Brand Logo** picker (`actions/browse/index.js`) with DAM search (`Search logo across DAM…`), folder navigation starting in the current shoot's parent folder, and embedded AEM small thumbnails (`cq5dam.thumbnail.140.100.png` / `319.319.png`).
   - Brand Logo is **horizontally centered and top-aligned** across the Live Preview (`.header-center` in 3-column CSS grid), native vector PDF (`actions/lib/pdf-native.js`), HTML-to-PDF (`packages/core/render.js`), and Firefly Boards (`actions/lib/firefly-boards.js`), and remembered per user (`prefs`).
4. **Friendly Metadata Captions & Multi-Level Sort / Group:**
   - Automatic metadata field discovery and coverage ranking (`packages/core/fields.js`) with friendly labels (`Vehicle Class`, `Campaign Name`, `File Size`, `Dimensions`—never raw namespace IDs).
   - 1–3 clamping lines and optional field label prefix per metadata field.
   - Natural alphanumeric sorting (`img_2` before `img_10`), multi-level sort keys, and section grouping with widow-safe group banners (`packages/core/sort.js`, `packages/core/layout.js`).
5. **Save PDF to AEM with Sequence Deduplication & Instant (`< 1s`) Download:**
   - Saves generated PDFs to the user's chosen AEM folder (remembered in `prefs`) and stamps `xmp:CreatorTool = "AEM Contact Sheet"` so future contact sheets automatically exclude previously generated contact sheet PDFs.
   - **Duplicate Filename Sequence Suffixing (`resolveUniqueFileName`):** Uses `{title-slug}_{yyyy-mm-dd}.pdf` and automatically appends incrementing sequence numbers (`-1.pdf`, `-2.pdf`, `-3.pdf`, …) when an asset with the same name already exists in the folder (including automatic conflict retry on `POST /adobe/assets`).
   - **Instant Download (`< 1s`):** Returns `inlinePdfBase64` directly for PDFs $\le 520\text{ KB}$, and for larger PDFs streams `480 KB` byte-range slices in parallel from AEM's `/adobe/assets/{id}/original/as/{fileName}` via `/status`—enabling the **Download PDF** button immediately without waiting ~60s for AEM's Smart Tagging / search indexing or hitting OpenWhisk's 1 MB payload limit.
6. **Send to Adobe Firefly Boards (`actions/lib/firefly-boards.js`):**
   - Creates a new Firefly Board via Adobe Federated MCP (`https://adobe-copilot-prod.adobe.io/mcp` → `boards_create_new_board`) or direct `aura-doc-service` V2 REST (`https://hz-aura-doc-service.adobe.io/v2/create-new-board`).
   - **Full / Highest Resolution Images:** Uses AEM's pre-signed original `downloadUrl` (`presignedUrl`, paginated at `limit: 10` on `search-assets`) on Author for JPEG/PNG/WebP originals (e.g., `2752 × 1536` PNGs or `1600 × 2000` JPEGs), and up to `2048px` Dynamic Media / `1280px` Author web renditions otherwise.
   - **Separate Editable Metadata Text Lines & Dynamic Grid Expansion:** Places each header line and each selected metadata field below an asset as its own stacked, individually editable text line (`height: 0.01` artboard so no white underline bar appears), with screen-adaptive spacing (`u = totalGridW / 1350`) and dynamic vertical row expansion supporting 10+ metadata fields per asset.
   - **Resilient Coediting Batching:** Orders all `createArtboard` ops before `addItemsToArtboard` ops in every 20-op `/compose` batch, adds a `550ms` inter-batch LES session cooldown, retries `503 LECCoeditingLimitExceeded` with exponential backoff, and retries any failed card media upload individually with fallback.
   - **Cross–IMS Org Support:** Discovers linked Adobe Account Cluster profiles (`/ims/organizations/v6` & `/ims/account_cluster/v2`), supports switching target Firefly Boards IMS Org profile (`/ims/check/v6/token`) or supplying a target org token while reading AEM assets with the AEM Org token, and automatically enables *"Anyone with the link can edit"* (`authenticated: editor`) + collaborator email invite via `https://invitations.adobe.io/api/v4/share/{boardUrn}?mode=direct_acl`.
7. **Watermark Overlays & Standalone Watermark Presets (`packages/core/layout.js`, `packages/core/render.js`, `actions/lib/pdf-native.js`):**
   - Custom watermark text (`CONFIDENTIAL`, `FPO — DO NOT DISTRIBUTE`, `DRAFT`), angle (`-90°` to `90°`, default `45°`), position (`Center`, `Top Left`, `Top Right`, `Bottom Left`, `Bottom Right`), opacity (`10%–90%`), and surface area coverage (`20%–90%`).
   - Dual-contrast neutral grey rendering so watermarks remain legible on both pure white and pure black assets.
   - Automatic font discovery from `/content/dam/fonts` and across DAM (`dc:format` search for `.ttf`, `.otf`, `.woff`, `.woff2`), rendered via `@font-face` in Live Preview and embedded via `@pdf-lib/fontkit` in vector PDFs.
   - Standalone Watermark Presets (`actions/presets/index.js`) that can be saved and loaded independently of layout presets.

---

## Documents
- Research: [research/contact-sheet-feature-research.md](research/contact-sheet-feature-research.md)
- MVP architecture and design: [docs/mvp-architecture.md](docs/mvp-architecture.md)
- Spike findings on `p59602`: [docs/spike-findings.md](docs/spike-findings.md)
- Firefly Boards MCP & `aura-doc-service` research: [docs/firefly-boards-mcp-research.md](docs/firefly-boards-mcp-research.md)

---

## Deployment & Commands

Target environment:
- **IMS Org:** `Adobe Internal Peter Nam` (`4A603BC061E191130A495FEF@AdobeOrg`, Org ID `767251`)
- **Project:** `AEM Contact Sheet` (`547DimSquid`, Workspace: `Production`)
- **AEM Author:** `https://author-p59602-e520244.adobeaemcloud.com`
- **AEM Content Hub (Delivery):** `https://delivery-p59602-e520244.adobeaemcloud.com`

```bash
npm test                                                       # run all 14 unit & integration tests
rm -rf dist .parcel-cache && aio app deploy --no-publish --no-log-forwarding-update
```
