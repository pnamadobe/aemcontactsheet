# Privacy, Security & Data Handling — AEM Assets Contact Sheets

This document describes the data flow, authentication model, tenant isolation, and storage retention policies of **AEM Assets Contact Sheets** for enterprise security review and **Adobe Exchange** compliance.

---

## 1. Data Flow & Architecture

1. **Browser UI (`aem/assets/assetsview/1` and `aem/assets/contenthub/1`):**
   - Runs inside the sandboxed Adobe Experience Cloud UI Extensibility `<iframe>` (`@adobe/uix-guest`).
   - Obtains the signed-in user's IMS access token via `guestConnection.host.auth.getIMSInfo()` and the active AEM repository host via `guestConnection.host.discovery.getAemHost()` / `?repo=...`.
2. **Adobe I/O Runtime Actions (`contactsheet/*`):**
   - All web actions (`resolve`, `generate`, `status`, `browse`, `presets`, `prefs`) enforce `require-adobe-auth: true` and `final: true` in `app.config.yaml`.
   - Every outbound request to AEM validates the target hostname against an SSRF allowlist (`https://*.adobeaemcloud.com`, `https://*.adobecqms.net`, or admin-configured `ALLOWED_AEM_HOSTS`) before forwarding the caller's IMS Bearer token.
   - No asset binaries, metadata, or user information are ever sent to third-party (non-Adobe) services.

---

## 2. Authentication & Multi-Tenant Isolation

- **Caller Identity (`extractAuth`):**
  - The user's `imsOrg` and `userId` are extracted from the JWT claims / Adobe I/O Gateway headers (`x-gw-ims-org-id`). Request query/body parameters cannot override JWT identity claims.
  - A deterministic per-user, per-org key (`userHash = sha256("${imsOrg}:${userId}").slice(0, 24)`) scopes all persisted records.
- **Job & Download Ownership Enforcement:**
  - Every `resolve` and `generate` job record stores `orgId` (`auth.imsOrg`) and `userHash` (`auth.userHash`).
  - `GET /status?jobId=...`, `GET /status?pdfJobId=...&chunk=...`, and `GET /status?mode=recentJobs` verify that both `job.orgId === auth.imsOrg` and `job.userHash === auth.userHash` before returning status, models, or PDF chunks (`403 FORBIDDEN` on mismatch).

---

## 3. Data Storage & Retention (TTL)

All temporary state and user preferences are stored exclusively within **Adobe App Builder Storage (`@adobe/aio-lib-state` and `@adobe/aio-lib-files`)** inside the customer's workspace:

| Data Type | Storage Key Pattern | Retention / TTL | Purpose |
|---|---|---|---|
| **Job Status (`resolve` / `generate`)** | `State`: `job.<jobId>` / `Files`: `jobs/<jobId>.json` | **7 days** (`604,800s`) | Tracks progress, warnings, and output asset path for active/recent contact sheet jobs. |
| **Resolved Sheet Model** | `State`: `file.models/<jobId>.json` / `Files`: `models/<jobId>.json` | **7 days** (`604,800s`) | Holds normalized asset metadata list between `/resolve` and `/generate`. |
| **Read-Only User PDF Chunks** | `State`: `pdf.<jobId>.<chunkIdx>` | **1 hour** (`3,600s`) | Allows read-only AEM users (who cannot save PDFs into AEM DAM) to download PDFs $> 520\text{ KB}$ directly in the browser. |
| **User Preferences (`prefs`)** | `Files` / `State`: `prefs/<imsOrg>/<userHash>.json` | **7 days** in State / Workspace lifetime in Files | Remembers the user's last selected output DAM folder path and header brand logo asset reference. No tokens or credentials are stored. |
| **Layout & Watermark Presets (`presets`)** | `Files` / `State`: `presets/<imsOrg>/<userHash>.json` | **7 days** in State / Workspace lifetime in Files | Stores user-created layout and watermark configuration presets. |

---

## 4. Credential Hygiene

- Optional server-to-server secrets (`PDF_SERVICES_CLIENT_SECRET`, `AEM_TECH_CLIENT_SECRET`) are bound directly as deployment inputs on the non-web `generate-worker` action in `app.config.yaml` and are never copied into async worker invocation payloads or persisted in job state.
