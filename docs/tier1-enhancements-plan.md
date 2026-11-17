# Tier 1 Contact Sheet Enhancements — Engineering Plan

_Target Environment: `author-p59602-e520244.adobeaemcloud.com` / `delivery-p59602-e520244.adobeaemcloud.com` (`767251-547dimsquid`)_

---

## Overview of Tier 1 Scope

| # | Feature | User Outcome | Core Touchpoints |
|---|---|---|---|
| **T1.1** | **Clickable Deep Links on Every Asset in the PDF & Preview** | Clicking any thumbnail or sequence `#001` in the generated PDF (or Live Preview) opens that exact asset's detail view in **AEM Assets View** (`tier=author`) or **AEM Content Hub** (`tier=delivery`). | `packages/core/layout.js`, `packages/core/render.js`, `actions/lib/pdf-native.js` |
| **T1.2** | **Approval & Publication Status Badges on Thumbnails** | Optional toggle (**Show status badge**) overlays a color-coded status pill (`Approved` green, `Rejected` red, `Pending / Draft` amber/grey + optional `Published` dot) in the corner of each thumbnail. | `packages/core/model.js`, `packages/core/layout.js`, `packages/core/render.js`, `actions/lib/pdf-native.js`, `src/shared-ui/components/ContactSheetDialog.js` |
| **T1.3** | **Include Subfolders Toggle (Recursive Folder Resolution)** | When launched on a folder (e.g. `/content/dam/26H2/hertz`), toggling **Include subfolders** in the modal re-resolves all assets recursively under that folder (`repo:ancestors`), with one-click grouping by `Folder`. | `src/shared-ui/components/ContactSheetDialog.js`, `actions/resolve/index.js`, `actions/lib/aem.js` |
| **T1.4** | **Page Theme Selector (`White`, `Photographer Dark`, `Neutral Proofing Grey`)** | Lets users switch the contact sheet page canvas between **Clean White (`#ffffff`)**, **Photographer Dark (`#18181b`)**, and **Neutral Proofing Grey (`#52525b`)** across Live Preview, HTML-to-PDF, and Native Vector PDF. | `packages/core/layout.js`, `packages/core/render.js`, `actions/lib/pdf-native.js`, `src/shared-ui/components/ContactSheetDialog.js` |

---

## Detailed Design per Item

### T1.1 · Clickable Deep Links on Every Asset in the PDF & Preview

1. **Verified Deep-Link URL Construction (`buildAssetDeepLink(asset, model)` in `packages/core/model.js`):**
   - **AEM Assets View (`tier === 'author'`):**
     - Source: `CQ/assets-app/src/app/utils/BrowseResourceUtils.js` & `DeepLinkActions.js`.
     - If `asset.path` (`/content/dam/...`) is present:
       `${aemHost}/ui#/aem/assets/detail${ asset.path.split('/').map(encodeURIComponent).join('/') }`
     - Fallback by URN (`asset.id`):
       `${aemHost}/ui#/aem/assets/go?action=asset-details&id=${encodeURIComponent(asset.id)}`
     - *(Using `${aemHost}/ui#/aem/...` automatically resolves the tenant's Experience Cloud `@imsOrgName` and `repoId` without hardcoding the org slug.)*
   - **AEM Content Hub (`tier === 'delivery'`):**
     - Source: `AEM-Assets-Adobe/contenthub/src/views/MainView.tsx` (`/assets/:assetId`).
     - URL: `https://experience.adobe.com/?repoId=${deliveryHost.replace(/^https?:\/\//, '')}#/assets/contenthub/assets/${encodeURIComponent(asset.id)}`
2. **Configuration (`config.layout.clickableLinks`):**
   - Default: `true` (checkbox **"Clickable asset links in PDF"** in *Page Layout & Output*).
3. **HTML / Live Preview (`packages/core/render.js`):**
   - When `layout.clickableLinks !== false`, wrap the `.thumb-frame` and `.seq-line` in `<a class="asset-deep-link" href="${deepLink}" target="_blank" rel="noopener noreferrer">` with a subtle external-link hover indicator in preview mode.
4. **Native Vector PDF (`actions/lib/pdf-native.js`):**
   - In `pdf-lib`, create a standard PDF `Link` annotation (`pdfDoc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [cellX, thumbBottomY, cellX + cellW, rowTopY], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(deepLink) } })`) and append its ref to `page.node.Annots()`.
   - Clicking anywhere on the thumbnail (or sequence number) in Acrobat, macOS Preview, or Chrome PDF Viewer opens the asset directly in AEM Assets View or Content Hub.

---

### T1.2 · Approval & Publication Status Badges on Thumbnails

1. **Normalized Status Field (`packages/core/model.js`):**
   - Normalize `asset.status` from `assetMetadata['dam:assetStatus']` (`'approved'`, `'rejected'`, `'pending'`, `'changes-requested'`, `'draft'`, or `null`) in `normalizeAsset()`.
2. **Configuration (`config.layout.statusBadges`):**
   - Default: `false` (checkbox **"Status badges on thumbnails"** in *Page Layout & Output*).
3. **Visual Design & Color Palette (Spectrum 2 Semantic Status Colors):**
   - **`approved`**: Pill background `#05834e` (Spectrum Positive Green), white text `APPROVED`
   - **`rejected`**: Pill background `#d73220` (Spectrum Negative Red), white text `REJECTED`
   - **`pending` / `changes-requested` / `draft`**: Pill background `#cb6f10` (Spectrum Notice Amber), white text `PENDING` / `DRAFT`
   - Positioned at top-right of `.thumb-frame` (`top: 4px; right: 4px; z-index: 4`) in HTML/CSS (`packages/core/render.js`), and drawn at the top-right corner of the thumbnail box (`cellX + cellW - badgeW - 4`, `rowTopY - badgeH - 4`) in `actions/lib/pdf-native.js`.

---

### T1.3 · Include Subfolders Toggle (Recursive Folder Resolution)

1. **UI Control (`src/shared-ui/components/ContactSheetDialog.js`):**
   - When `source.kind === 'folder'`, display an **Include subfolders** checkbox pill right in the top bar (next to the folder path pill and asset count badge) and in *Sort & Group*.
2. **Dynamic Re-Resolution (`handleToggleSubfolders(includeSubfolders)`):**
   - Toggling **Include subfolders** calls `POST /resolve` with `{ source: { ...source, includeSubfolders }, tier, aemHost }`.
   - `resolveFolderAssets` in `actions/lib/aem.js` already queries `term: { 'repositoryMetadata.repo:ancestors': [resolvedFolderId] }`; when `includeSubfolders: true`, it keeps all descendant hits across nested subfolders instead of filtering to direct children.
   - Updates `model` and `modelFileKey` in place while preserving the user's current header, caption, watermark, and layout settings.

---

### T1.4 · Page Theme Selector (`Clean White`, `Photographer Dark`, `Neutral Proofing Grey`)

1. **Configuration (`config.layout.theme` in `packages/core/layout.js`):**
   - Values: `'light'` (Clean White — default), `'dark'` (Photographer Dark), `'grey'` (Neutral Proofing Grey).
2. **Theme Token Palette (`THEME_PALETTES` shared by `render.js` & `pdf-native.js`):**
   | Token | `light` (Clean White) | `dark` (Photographer Dark) | `grey` (Neutral Proofing Grey) |
   |---|---|---|---|
   | Page Background | `#ffffff` / `rgb(1, 1, 1)` | `#18181b` / `rgb(0.094, 0.094, 0.106)` | `#52525b` / `rgb(0.322, 0.322, 0.357)` |
   | Thumb Frame Fill | `#f8f9fb` / `rgb(0.97, 0.98, 0.99)` | `#27272a` / `rgb(0.153, 0.153, 0.165)` | `#3f3f46` / `rgb(0.247, 0.247, 0.275)` |
   | Thumb Frame Border | `#e5e7eb` / `rgb(0.90, 0.91, 0.92)` | `#3f3f46` / `rgb(0.25, 0.25, 0.28)` | `#71717a` / `rgb(0.44, 0.44, 0.48)` |
   | Primary Text / Title | `#111827` / `rgb(0.07, 0.09, 0.15)` | `#f4f4f5` / `rgb(0.96, 0.96, 0.96)` | `#fafafa` / `rgb(0.98, 0.98, 0.98)` |
   | Secondary / Meta Text | `#4b5563` / `rgb(0.30, 0.33, 0.39)` | `#a1a1aa` / `rgb(0.63, 0.63, 0.67)` | `#e4e4e7` / `rgb(0.89, 0.89, 0.91)` |
   | Muted / Footer Text | `#6b7280` / `rgb(0.42, 0.45, 0.50)` | `#71717a` / `rgb(0.52, 0.52, 0.56)` | `#d4d4d8` / `rgb(0.83, 0.83, 0.85)` |
   | Group Band Fill | `#f3f4f6` / `rgb(0.95, 0.96, 0.97)` | `#27272a` / `rgb(0.15, 0.15, 0.17)` | `#3f3f46` / `rgb(0.25, 0.25, 0.28)` |
   | Header / Footer Rule | `#222222` / `#e5e7eb` | `#52525b` / `#3f3f46` | `#d4d4d8` / `#71717a` |
3. **PDF Background Rendering (`actions/lib/pdf-native.js`):**
   - For `'dark'` and `'grey'` themes, draw a full-page background rectangle (`x: 0, y: 0, width: pageW, height: pageH, color: palette.pageBg`) as the first operation on each page before drawing the header, group bands, thumbnails, and captions.

---

## Execution Order & Verification

1. **Step 1 — `@contactsheet/core` (`packages/core/model.js`, `packages/core/layout.js`, `packages/core/render.js`):**
   - Add `asset.status` normalization and `buildAssetDeepLink(asset, model)`.
   - Add `clickableLinks: true`, `statusBadges: false`, and `theme: 'light'` to `createDefaultConfig()`.
   - Export `THEME_PALETTES` and update `buildStylesheet()` + `renderHtml()` to render clickable deep links, status badges, and page themes.
2. **Step 2 — Native Vector PDF (`actions/lib/pdf-native.js`):**
   - Render full-page theme backgrounds + theme text colors, top-right status badge pills, and PDF `URI` link annotations over each thumbnail cell.
3. **Step 3 — Modal UI (`src/shared-ui/components/ContactSheetDialog.js`):**
   - Add **Include subfolders** toggle (for folder sources) with live re-resolution.
   - Add **Page theme** dropdown (`Clean White`, `Photographer Dark`, `Neutral Proofing Grey`), **Status badges on thumbnails** checkbox, and **Clickable asset links in PDF** checkbox in *Page Layout & Output*.
4. **Step 4 — Unit Tests, Production Deploy, Commit & Push:**
   - Add unit tests in `packages/core/__tests__/core.test.js` and `actions/__tests__/actions.test.js` covering all 4 Tier 1 features.
   - Deploy to Production (`767251-547dimsquid`) and push to `origin/main`.
