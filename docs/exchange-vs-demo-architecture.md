# Adobe Exchange vs. Internal Demo Build Architecture & Deployment Guide

This document explains how a single repository (`aem-contact-sheet`) produces two distinct, verified App Builder deployments without maintaining divergent Git branches:

1. **Adobe Exchange Build (`exchange` — default):**
   - Target IMS Org: **Adobe Plugin Developers** (for public/partner distribution on Adobe Exchange)
   - Capabilities: Full **PDF Contact Sheet** creation in AEM Assets View (`aem/assets/assetsview/1`) and AEM Content Hub (`aem/assets/contenthub/1`), live responsive preview, custom DAM font watermarks, metadata discovery/sorting/grouping, status badges, clickable deep links, and AEM upload/download.
   - Guarantees: **Zero** internal-only Adobe endpoints, **zero** first-party web client IDs (`aura_webapp`, `projectx_webapp`), and **zero** cross-org bearer token persistence in `localStorage` or `prefs`. Enforced on every build and CI run by `scripts/check-exchange.js`.

2. **Internal Demo Build (`demo`):**
   - Target IMS Org: **Adobe Internal Peter Nam** (`4A603BC061E191130A495FEF@AdobeOrg`, Project `547DimSquid`)
   - Capabilities: Everything in the Exchange build **plus** direct cloud-canvas exports to **Adobe Firefly Boards** (`outputFormat: 'boards'`) and **Adobe Express** (`outputFormat: 'express'`, multi-page `HzJSON` v1 import via Sensei CPF), along with the **Target IMS Org / Profile** token switcher in the left inspector rail.

---

## 1. Architectural Separation (Option B: Single Branch + Isolated `internal/` Overlay)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Shared Core & Public PDF Pipeline                     │
│  • packages/core/*              (model, fields, sort, layout, HTML render)   │
│  • actions/resolve/*            (AEM Author & Delivery asset discovery)      │
│  • actions/generate-worker/*    (HTML-to-PDF & native vector PDF + upload)   │
│  • actions/status/*, browse/*, presets/*                                     │
│  • src/shared-ui/components/ContactSheetDialog.js                            │
└───────────────────────────────┬──────────────────────────────┬───────────────┘
                                │                              │
         ┌──────────────────────▼───────────────┐    ┌─────────▼─────────────────────────────┐
         │   1. Adobe Exchange Build (Default)  │    │      2. Internal Demo Build           │
         │   (`npm run build:exchange`)         │    │      (`npm run build:demo`)           │
         ├──────────────────────────────────────┤    ├───────────────────────────────────────┤
         │ • Manifest: `app.config.yaml`        │    │ • Manifest: `internal/app.config.demo │
         │ • UI Slot:                           │    │   .yaml` (swapped in during build)    │
         │   `src/shared-ui/cloud-canvas-slot`  │    │ • UI Slot:                            │
         │   (no-op stub: returns `null`)       │    │   `internal/ui/cloud-canvas-slot.js`  │
         │ • Actions:                           │    │ • Actions:                            │
         │   - `actions/generate/index.js`      │    │   - `internal/actions/generate`       │
         │     (accepts `outputFormat: 'pdf'`)  │    │   - `internal/actions/generate-worker`│
         │   - `actions/generate-worker`        │    │     (runs Firefly Boards & Express,   │
         │   - `actions/prefs/index.js`         │    │      delegates PDF to public worker)  │
         │     (stores folder & logo only)      │    │   - `internal/actions/prefs`          │
         │ • Gate: `scripts/check-exchange.js`  │    │     (adds `savedBoardsProfiles`)      │
         └──────────────────────────────────────┘    └───────────────────────────────────────┘
```

### Why a File-Swap Slot (`cloud-canvas-slot.js`) Instead of a Runtime Flag?
`@adobe/aio-cli-plugin-app` bundles UI extensions with Parcel in a mode that preserves module exports across file boundaries and generates `.js.map` source maps. If internal strings (such as `hz-aura-doc-service`, `aura_webapp`, `projectx_webapp`, `sensei.adobe.io`, or `cs_saved_boards_profiles`) exist anywhere in a file imported by `src/`, they appear in `dist/` bundles or source maps even behind an `if (false)` check.

By isolating all Firefly Boards and Adobe Express UI code inside `internal/ui/cloud-canvas-slot.js` and keeping `src/shared-ui/cloud-canvas-slot.js` as a clean 30-line no-op stub:
- When building for **Adobe Exchange**, Parcel only ever sees the no-op stub. Neither `dist/*.js` nor `dist/*.js.map` contains a single byte of Firefly Boards or Adobe Express code.
- When building for **Internal Demos** (`scripts/with-demo-config.js`), the script temporarily writes `internal/app.config.demo.yaml` → `app.config.yaml` and `internal/ui/cloud-canvas-slot.js` → `src/shared-ui/cloud-canvas-slot.js`, clears `.parcel-cache` and `dist`, runs `npx aio app build` or `npx aio app deploy`, and restores the original Exchange files in a `finally` block.

---

## 2. File-by-File Mapping

| Component | Adobe Exchange Build (Committed Default) | Internal Demo Build (`internal/` Overlay) |
|---|---|---|
| **App Builder Manifest** | `app.config.yaml` | `internal/app.config.demo.yaml` |
| **`POST /generate` Action** | `actions/generate/index.js` (`outputFormat: 'pdf'` only) | `internal/actions/generate/index.js` (`'pdf' \| 'boards' \| 'express'`) |
| **`generate-worker` Action** | `actions/generate-worker/index.js` (PDF pipeline only) | `internal/actions/generate-worker/index.js` (Boards & Express + delegates PDF to `actions/generate-worker/index.js`) |
| **`GET/PUT /prefs` Action** | `actions/prefs/index.js` (`lastOutputFolder`, `lastLogo`) | `internal/actions/prefs/index.js` (adds `savedBoardsProfiles`, `defaultBoardsProfileId`) |
| **Firefly Boards Client** | _Excluded_ | `internal/actions/lib/firefly-boards.js` |
| **Adobe Express (`HzJSON`) Client** | _Excluded_ | `internal/actions/lib/adobe-express.js` |
| **UI Cloud-Canvas Hook & Controls** | `src/shared-ui/cloud-canvas-slot.js` (no-op stub) | `internal/ui/cloud-canvas-slot.js` (top-bar buttons, Target IMS Org switcher, completion cards) |
| **Unit Tests** | `packages/core/__tests__/core.test.js`, `actions/__tests__/actions.test.js` | `internal/__tests__/internal.test.js` |
| **Research Docs** | `docs/mvp-architecture.md`, `docs/spike-findings.md`, `docs/tier1-enhancements-plan.md` | `internal/firefly-boards-mcp-research.md`, `internal/adobe-express-hzjson-research.md` |

---

## 3. Automated Exchange Verification Gate (`scripts/check-exchange.js`)

Running `npm run check:exchange` (automatically invoked at the end of `npm run build:exchange` and in GitHub Actions CI) scans every `.js`, `.json`, `.yaml`, and `.html` file across:
- `app.config.yaml`
- `src/`
- `actions/`
- `packages/`
- `dist/` (compiled OpenWhisk action bundles, Parcel web bundles, and `.js.map` source maps)

The build fails with a non-zero exit code if any of the following internal patterns appear:

| Forbidden Pattern | Reason |
|---|---|
| `aura_webapp` | Internal Firefly Boards web client ID |
| `projectx_webapp` | Internal Adobe Express web client ID |
| `hz-aura-doc-service` | Internal Firefly Boards document service endpoint |
| `sensei.adobe.io/services/v2/predict` | Internal Sensei CPF `HzJSON` import endpoint |
| `senseicore` | Internal Sensei status polling endpoint |
| `invitations.adobe.io` | Internal invitations/ACL sharing endpoint |
| `adobe-copilot` | Internal Federated MCP gateway |
| `boards_create_new_board` | Internal Firefly Boards MCP tool |
| `cs_saved_boards_profiles` | Demo saved token profiles in `localStorage` |
| `savedBoardsProfiles` | Demo saved token profiles in `prefs` |
| `boardsBearerToken` | Demo Boards/Express token parameter |
| `internal/actions` | Reference to internal-only action path |
| `p59602-e520244` | Hardcoded internal demo AEM environment hostname |
| `767251-547dimsquid` | Hardcoded internal demo App Builder runtime namespace |

---

## 4. Complete Command Reference

### A. Running Tests
```bash
# Run only the public Adobe Exchange test suite (core + public actions + security/multi-tenancy)
npm test

# Run all unit & integration tests (core + public actions + internal Firefly Boards & Adobe Express)
npm run test:all
```

### B. Building & Deploying the Internal Demo (`Adobe Internal Peter Nam` — `547DimSquid`)
Use this workflow when deploying to your internal demo environment (`author-p59602-e520244.adobeaemcloud.com` / App Builder project `547DimSquid`, Org `767251`) with **Send to Firefly Boards** and **Open in Adobe Express** enabled:

```bash
# 1. Build the demo bundle locally (optional verification step)
npm run build:demo

# 2. Deploy actions + web UI with Firefly Boards & Adobe Express enabled
#    (Automatically selects 547DimSquid-767251-Production.json, swaps in internal/app.config.demo.yaml
#     and internal/ui/cloud-canvas-slot.js, deploys to App Builder, and restores Exchange files afterward)
npm run deploy:demo -- --no-publish --no-log-forwarding-update
```

### C. Building & Deploying for Adobe Exchange (`Adobe Plugin Developers` — `aemcontactsheets-393012`)
Use this workflow when building or deploying the clean PDF-only application to your **AEM Contact Sheets** project (`aemcontactsheets`, Org `393012`) in the **Adobe Plugin Developers** IMS Org:

```bash
# 1. Build the Exchange bundle and run the automated Exchange Readiness Check
npm run build:exchange

# 2. Re-run the verification check at any time
npm run check:exchange

# 3. Deploy to Adobe Plugin Developers — Stage workspace (aemcontactsheets-393012-Stage.json)
npm run deploy:exchange:stage

# 4. Deploy to Adobe Plugin Developers — Production workspace (aemcontactsheets-393012-Production.json)
npm run deploy:exchange
```
