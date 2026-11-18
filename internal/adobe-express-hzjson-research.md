# Adobe Express Export Research & Architecture (`HzJSON` v1 + Sensei CPF)

_Compiled & live-verified Nov 17, 2026 against Production (`https://sensei.adobe.io/services/v2/predict`, `https://cc-api-storage.adobe.io`, and `https://invitations.adobe.io`)._

---

## 1. Executive Summary

To export a multi-page **AEM Assets Contact Sheet** as a native, editable multi-page **Adobe Express** document (`application/vnd.adobe.hz.express+dcx`), we use the same **Horizon JSON (`HzJSON` v1)** pipeline that powers Firefly Boards' *"Open in Express"* and Adobe Express's headless document importer:

1. **Build `HzJSON` v1 (`internal/actions/lib/adobe-express.js` → `buildContactSheetHzJson`):**
   - Converts each page in `paginated.pages` into an `HzJSON` `artboard` scene node (`96 px/in`) containing independent, editable Express elements:
     - Page background `rectangle` (`Clean White`, `Photographer Dark`, or `Neutral Proofing Grey` theme)
     - Sheet header (`Title`, centered `Brand Logo` bitmap, `Date`, `Prepared by`, `Source`, and divider rule)
     - Section group banners (`group-band`) with accent bars
     - Thumbnail `rectangle` frames and `BitmapFill` nodes (`contain` or `cover`)
     - Approval status badge pills (`APPROVED`, `REJECTED`, `PENDING`), rotated watermark `text` overlays, and individual editable metadata caption `text` nodes
     - Page footer (`Page X of Y`)
2. **Embed Asset Renditions as `data:` URIs in `HzJSON` `resources`:**
   - The headless Chrome instance inside `hzjson-import-engine` blocks external non-ACP image URLs due to CORS / domain allowlisting, but natively decodes **`data:image/jpeg;base64,...`** and **`data:image/png;base64,...`** URIs in `resources[].children[].url` and uploads each image into the new Express document's ACP container (`cc-api-storage.adobe.io/id/{docId}/:manifest` → `children[name="resources"].components` with `rel: "resource"`).
3. **Submit Async Job to Sensei CPF (`POST https://sensei.adobe.io/services/v2/predict`):**
   - **Engine ID:** `Feature:autocrop:Service-f3c41ebbaca44b0384e506185c1cf583` (`hzJSONtoHz`)
   - **Headers:** `Authorization: Bearer <target org token>`, `x-api-key: aura_webapp` (or `projectx_webapp`), `Prefer: respond-async`
   - **Polling:** Polls `Location` (`https://senseicore-ue1.adobe.io/services/v2/status/{requestId}`) and parses the `multipart/mixed` response (`name="results"`) to extract `documentId` (`urn:aaid:sc:US:...`).
4. **Cross-Profile / Cross–IMS Org Sharing (`POST https://invitations.adobe.io/api/v4/share/{docUrn}?mode=direct_acl`):**
   - Step 1: Grants link access (`{ recipient: "all", role: "viewer" }`, `{ recipient: "authenticated", role: "editor" }`).
   - Step 2: Grants direct email access (`{ recipient: "mailto:...", role: "editor" }`) with `"notification": { "suppress": true }` (required by `invitations.adobe.io` for `mailto:` recipients).
5. **Document URL Format & Sandboxed Iframe `COOP` Handling:**
   - Express document URLs require **unencoded colons** in the URN path:
     `https://new.express.adobe.com/id/urn:aaid:sc:US:...` (percent-encoded `urn%3Aaaid...` returns 404 in the Express router).
   - Because AEM Assets View's modal `<iframe>` (`@adobe/uix-host`) sets `sandbox="allow-scripts allow-same-origin allow-forms allow-popups ..."` **without** `allow-popups-to-escape-sandbox`, and `new.express.adobe.com` sends `Cross-Origin-Opener-Policy: same-origin` (`COOP: same-origin`), Chromium blocks popup tabs opened directly from the sandboxed iframe with `ERR_BLOCKED_BY_RESPONSE`.
   - To avoid this browser restriction, the completion card provides a 1-click **Copy Adobe Express Link** action so the user can open a normal top-level tab (`Cmd+T`) and paste (`Cmd+V`).

---

## 2. Critical Implementation Details & Gotchas

| Area | Finding | Resolution in `internal/actions/lib/adobe-express.js` |
|---|---|---|
| **Text Scaling (`EXPRESS_TEXT_SCALE = 96 / 72`)** | On import, `hzjson-import-engine` applies an affine scale of `xscale: 1.333333, yscale: 1.333333` (`96 / 72`) to every `Text` scene node's `textGeometry.width`, `textGeometry.height`, and `fontSize`. Without pre-dividing by `96 / 72`, right-aligned header/footer text overflows past the right edge of the page and thumbnail captions overflow into adjacent columns. | `buildTextNode()` divides `width`, `height`, and `fontSize` by `EXPRESS_TEXT_SCALE = 96 / 72` (`4 / 3`) so the resulting on-canvas text frame matches the exact artboard pixel width. |
| **Multi-Line Caption Clamping** | Long asset titles in a 1-line field wrap onto a second line in Express if not clamped to the column character width, colliding with the next metadata line below. | `buildContactSheetHzJson()` computes `maxCharsPerLine = Math.max(18, Math.floor(cellW / 5.6))`, truncates 1-line fields with `…`, and scales vertical step by `estimatedLines` when `maxLines > 1`. |
| **Bitmap Resources (`data:` URIs vs External URLs)** | Passing external `https://author-...adobeaemcloud.com/...` URLs in `resources[].children[].url` results in empty gray frames because Headless Chrome inside the CPF container cannot fetch external non-ACP origins. | `exportContactSheetToAdobeExpress()` fetches thumbnails in parallel (`concurrency: 8`) via `aem.fetchAssetThumbnailBuffer` and embeds `data:image/jpeg;base64,...` / `data:image/png;base64,...` URIs, which are uploaded as native ACP `rel: "resource"` components. |
| **Literal Colons in `/id/urn:aaid:sc:...`** | `new.express.adobe.com/id/urn%3Aaaid...` fails client-side route matching and shows 404. | Construct `expressUrl` as `${EXPRESS_BASE_URL}/id/${parsed.documentId}` without `encodeURIComponent`. |
| **`invitations.adobe.io` `notification` Parameter** | Including `mailto:` recipients in `POST /api/v4/share/{urn}?mode=direct_acl` without `notification: { suppress: true }` returns `400 {"errorCode":"400.1","error":"Missing or invalid parameter: notification"}`. | Send link-sharing (`all` + `authenticated`) in a dedicated first request, and pass `notification: { suppress: true }` on the `mailto:` request. |
| **Server-Side Token Validation (`GET /prefs`)** | `ims-na1.adobelogin.com/ims/profile/v1` omits `Access-Control-Allow-Origin` on `401` responses, causing browser `fetch` to throw a CORS error instead of returning `status: 401`. Also, `aio auth login --force` hits `/ims/logout/v1`, which revokes browser tokens prior to their 24h `expires_in` timestamp. | `actions/prefs/index.js` validates each saved profile's token server-side against `https://ims-na1.adobelogin.com/ims/profile/v1` on `GET /prefs` and sets `tokenExpired: true` when a token has been revoked or expired. |
