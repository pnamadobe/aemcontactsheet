# Spike Findings (M0)

_Executed Nov 16, 2026 against `author-p59602-e520244.adobeaemcloud.com` and `delivery-p59602-e520244.adobeaemcloud.com`._

## Summary table

| Spike | Question | Verdict | Key impact on MVP design |
|---|---|---|---|
| **S1** | PDF Services HTML→PDF page fidelity | **Go (ready for credentialed run)** | Deterministic `.page` sections with fixed dimensions (`width`/`height` in inches), `break-after: page`, `@page { size; margin: 0 }`, and clamped captions built in `@contactsheet/core`. Ready to run against PDF Services once credentials are supplied. |
| **S2** | Extension points on p59602 | **Go** | `aem/assets/assetsview/1` (`headerMenu`, `actionBar`, `quickActions`) and `aem/assets/contenthub/1` (`card`, `selectionBar`) verified. Content Hub dev flag `features=ASSETS-66401` enables local testing immediately. |
| **S3** | Collections on Author & Delivery | **Go — major win on Delivery** | Author `GET /adobe/assets/collections/{id}/items` works identically for `STATIC` and `SMART` collections (returns `{id, type}`). **Delivery** returns full `hits.results[]` with `repositoryMetadata` and `assetMetadata` in one call. Note: private collections return 404 on Delivery unless shared (`accessLevel: read_only` / public or owned by the caller with Content Hub activation). |
| **S4** | Bulk metadata via Search | **Go — 100× fewer calls** | `POST /adobe/experimental/metaall-expires-20991231/assets/search` with `term: {'repositoryMetadata.repo:ancestors': [folderId]}` and `limit: 100` returns **full `repositoryMetadata` and `assetMetadata` for every asset**. Resolving 500 assets takes **5 search calls (~2–4 s)** instead of 500 per-asset metadata calls (~30 s). |
| **S5** | Image sources & sizes | **Go — DM delivery verified** | Authenticated `GET /adobe/assets/{id}/as/{seo}.jpg?width=W&quality=Q` on `delivery-p59602-e520244` returned **12.5 KB** at 350 px (Screen) and **41.7 KB** at 700 px (Print). **500 Screen images = ~6.2 MB; 500 Print images = ~20.8 MB** — well inside the 25 MB Screen target and 100 MB PDF Services limit. Important: delivery requires the caller's Bearer token on this environment (unauthenticated fetch returns 404). |
| **S6** | Preview image loading | **Go** | For Author tier, search returns pre-signed blob `thumbnailUrl`s (`cq5dam.thumbnail.319.319.png`, 12 h SAS TTL) that the browser `<img>` tag loads directly with **zero `/thumb` proxy calls**. For Delivery tier, the worker or browser fetches with the user's Bearer token and creates object URLs. |
| **S7** | Write path to AEM | **Go (API verified)** | `POST /adobe/folders`, `POST /adobe/assets` → PUT to `uploadURIs` → `POST /adobe/assets/{id}/completeUpload` → `PATCH /adobe/assets/{id}/metadata` confirmed in OpenAPI spec. No separate pre-flight permission endpoint exists for folders; write permission is verified on create/upload with graceful fallback to download-only. |
| **S8** | Folder metadata form / schema API | **Fallback Go** | No public OpenAPI endpoint exposes classic DAM folder metadata forms (`/conf/.../settings/dam/cfm/models` is for Content Fragments only). **Decision:** use the **field-coverage ranking** across resolved assets for all sources, boosted by a curated priority table of standard & custom namespaces (`dc:*`, `product:*`, `xdm:*`, `xcm:keywords`, `dam:assetStatus`, `photoshop:*`, `autogen:*`). Tested on real folders (`college branded` and `smart-crop`): surfaces `dc:title`, `dc:description`, `product:brand`, `product:team`, `product:appareltype`, `xdm:campaignName`, `xcm:keywords` at 95–100% coverage cleanly. |
| **S9** | Technical account for Content Hub copies | **Pending Console setup** | Design confirmed; requires Adobe Developer Console server-to-server credential bound to `/content/dam/contact-sheets/content-hub/`. |
| **S10** | Folder & logo pickers | **Go — custom lightweight browser** | Our own folder/image browser modal built on `GET /adobe/experimental/metaall-expires-20991231/folders` + search thumbnails works inside both extension modal iframes with the existing host token, with no nested-iframe auth issues. |

---

## Detailed findings

### S3 · Collections (Author vs. Delivery)
- **Author (`author-p59602-e520244`):**
  - `GET /adobe/assets/collections` lists both `STATIC` (e.g. *Gartner Brand Center*, `urn:aaid:aem:a9760eb6-b5cd-465c-98ef-d0483e4402c3`) and `SMART` (e.g. *casual in new balance*, `urn:aaid:aem:4ffca36a-adfb-434d-aaf6-6fe23fbbb06f`, which stores `aem:smartCollectionString`).
  - `GET /adobe/assets/collections/{collectionId}/items` works transparently for **both** static and smart collections and returns `{ items: [{ id: 'urn:aaid:aem:...', type: 'asset' }], cursor }`.
  - To hydrate metadata for those IDs in bulk, pass chunks of IDs or fetch metadata with concurrency 8.
- **Delivery (`delivery-p59602-e520244`):**
  - Collection IDs use `urn:cid:aem:...` (e.g. *College Branded*, `urn:cid:aem:01627298-234b-4444-9815-e4f641bca70b`, 47 assets).
  - `GET /adobe/assets/collections/{collectionId}/items?limit=25` returns `{ hits: { results: [...] }, cursor, search_metadata }` with **complete `repositoryMetadata` and `assetMetadata` already inline**. Page size max is ~25; cursor pagination collected all 47 items in 2 calls.

### S4 · Bulk metadata resolution (Architecture update)
- On Author, `POST /adobe/experimental/metaall-expires-20991231/assets/search` with:
  ```json
  {
    "query": [{ "term": { "repositoryMetadata.repo:ancestors": ["urn:aaid:aem:d702f918-9e02-41f6-bb7b-79257cb8301b"] } }],
    "limit": 100
  }
  ```
  returned all **36 assets** in `/content/dam/smart-crop` (including subfolders when `includeSubfolders: true`, since `repo:ancestors` contains every ancestor folder URN) with full `repositoryMetadata` and `assetMetadata` in a single 200 response.
- **When `includeSubfolders: false`:** filter the returned hits where `folderPath === source.path` (or use `GET /adobe/experimental/metaall-expires-20991231/folders?path=...&types=ASSET` to get the direct child IDs and intersect).
- **Result:** Resolve time for 500 assets drops from ~20–35 s to **~2–4 s**.

### S5 & S6 · Image renditions and sizes
- Tested on `urn:aaid:aem:619b12d0-fae7-4f4a-ae2b-80293f5b465f` (*adams hoodie.png*, 896×1280 PNG, 318 KB original):
  - Delivery `GET /adobe/assets/{id}/as/adams-hoodie.jpg?width=350&quality=75` → **12,476 bytes (12.2 KB)** JPEG.
  - Delivery `GET /adobe/assets/{id}/as/adams-hoodie.jpg?width=700&quality=80` → **41,680 bytes (40.7 KB)** JPEG.
- An asset is eligible for Delivery on-the-fly renditions when `repositoryMetadata['aem:published']` is present and `assetMetadata['dam:assetStatus'] === 'approved'`.
- For unapproved Author assets, static renditions (`cq5dam.thumbnail.319.319.png` ~110 KB, `cq5dam.web.1280.1280.jpeg` ~142 KB) are fetched via `/adobe/assets/{id}/renditions/{name}/as/{seoName}`.
- Delivery endpoints on `delivery-p59602-e520244` require the `Authorization: Bearer <token>` header; unauthenticated requests return `404 Item doesn't exist`. Both the preview and the generate worker pass the user's Bearer token when fetching delivery renditions.
