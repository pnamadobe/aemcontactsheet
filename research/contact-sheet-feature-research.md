# AEM Assets Contact Sheets — Feature Research

_Compiled Nov 16, 2026. Sources: competitor documentation (19 products), customer and community posts (Experience League, Adobe forums and ideas boards, Reddit, vendor idea portals), Adobe product and API docs, and internal Adobe Slack._

---

## 1. Executive summary

- **The need is real, and AEM is behind.** No AEM product makes contact sheets today: not Assets as a Cloud Service, Assets view, Content Hub, Asset Share Commons or 6.5. The Experience League thread on it ("Export Contact sheets from Adobe Assets", ~2.5k views) was answered "not available OOTB". Field teams keep asking internally (2024 → Nov 2026). Customers are building their own (Dick's Sporting Goods, Sam's Club via Workfront/Fusion), and partners sell add-ons (3|SHARE).
- **Competitors treat contact sheets as standard** (Canto, Aprimo, Brandfolder, OpenAsset, ResourceSpace, Asset Bank, Portfolio, Daminion, OTMM, globaledit, Akeneo…), but most versions are basic: fixed layouts, admin-only field choice, browser-print PDFs. AEM can catch up quickly and **pull ahead on metadata, governance, links back to the asset, and interactive output**.
- **The #1 customer request is choosing which metadata prints under each thumbnail** (custom fields, not just the filename). It came up in ~13 independent sources. Bridge and Photoshop can't do it; Lightroom Classic can, but only on the desktop.
- **Firefly Boards is the obvious Adobe infinite canvas, but it has no public API and no AEM import today.** In the near term, "infinite canvas" means one of:
  - a canvas we build ourselves on top of AEM;
  - a semi-manual hand-off to Firefly Boards;
  - a **Frame.io Share** (a hosted, interactive grid with metadata, expiry, passphrase and comments).
- **Recommended shape:** **one contact-sheet data model, several renderers**:
  1. Live HTML preview
  2. PDF (MVP)
  3. Shareable web lookbook
  4. XLSX / PPTX
  5. Canvas / Frame.io / Boards (later)

  The PDF is saved back into AEM as an asset and shared with AEM's built-in share links.

---

## 2. Evidence of demand

### Internal (Adobe Slack)
| Signal | Takeaway |
|---|---|
| #guild-aem-assets, Nov 2026: a customer migrating from **MediaBeacon** needs a PDF with "thumbnails, metadata, and **links back to the assets**". Screenshots and Bridge both fell short. | Parity requirement for DAM migrations. Links back to the asset are expected. |
| #guild-aem-assets, Aug 2024: "select any folder… generate a contact sheet in document form… readable grid… **typically 40–60 assets**." Re-asked Nov 13, 2026 ("for proofing photo sets"). No answer. | Clean statement of the core job. Still unsolved two years later. |
| Suggested workaround: ACS AEM Commons InDesign Dynamic Deck, which needs InDesign Server and is "a bit complicated" to set up on AEM as a Cloud Service. | The only answer we have today is heavyweight. |
| **Dick's Sporting Goods**: custom contact-sheet solution documented in Confluence, generated once the "select" images from a shoot land in AEM. | Photo-studio selects workflow. |
| **Sam's Club**: Workfront/Fusion automation produces "proofs/contact sheets". Problems: 16 assets stuck at 85% for 30+ minutes, the audit log reported success before the sheet existed, and wrong or stale images appeared. | Needs async jobs with **honest status**, fresh renditions, and duplicate-filename safety. |
| **Lenovo**: contact sheets for shot lists, uploaded to Frame.io for comments. | Contact sheets double as a **review** surface. |
| Earlier: an Asset Share Commons build exported search results with thumbnails to XLS. | Spreadsheet output is wanted. |

### External: what customers ask for, ranked
| # | Capability | ~Sources |
|---|---|---|
| 1 | **Pick the metadata under each thumbnail**, including custom fields (title, caption, people, event, SKU…) | 13 |
| 2 | **Create it inside the DAM** from a selection, folder or collection, with no Bridge/InDesign/Photoshop round-trip | 8 |
| 3 | **Layout control**: columns/rows, thumbnail size, page size, caption placement, multi-line wrapping | 7 |
| 4 | **Ratings, flags, colour labels or approval status** shown on the sheet | 5 |
| 5 | **Large sets** (hundreds to thousands of assets) with automatic page breaks; no hangs or blank output | 5 |
| 6 | **Built for markup**: space for notes and checkboxes, "red pen" review, editable PDF (top Bridge idea, 14 votes, from the US military photo community) | 5 |
| 7 | **Small, shareable PDFs** (Bridge produces 25–100 MB+ files) | 4 |
| 8 | **Header/footer branding**, page numbers, asset numbers | 4 |
| 9 | **Reusable templates shared across the team that survive upgrades** (Bridge 2024 broke users' templates) | 3 |
| 10 | **Non-photo assets**: video frames, vectors, PSD, RAW | 3 |
| 11 | **Admin control** over who can export | 2 |

Not directly requested by external users, but worth testing as possible differentiators: **QR codes or links back to each asset** (internally, the MediaBeacon migration customer does want links) and **printing rights or expiry status** on the sheet.

---

## 3. Personas and jobs to be done

| Persona | Job | Must-have content |
|---|---|---|
| Brand / marketing manager | Choose the selects from a shoot (often 10 of ~800 frames) | Thumbnail, ID or filename, rating or status, shareable |
| E-commerce / retail studio ops (DSG, Sam's Club) | Art-director selects and quality checks across product sets | SKU / style number, shot angle, status, selects checkbox |
| Photographer / agency | Send numbered proofs or present options to a client | Branding, numbering, small PDF, notes space |
| Government / news photo desk | Check captions and required metadata before release | Full caption, required fields, editable or markup-friendly PDF |
| Archivist / museum / library | Printed visual index of a collection | Object or asset ID, people, event, location, notes |
| Production / prepress | Check whether files are suitable for print | Filename, pixel dimensions, resolution, colour profile |
| Architecture / professional services | Put project imagery into proposals | PDF plus PPTX, one-sheets |
| Video editor | Visual index of clips | Poster frame or keyframe strip, timecode, clip name |
| Legal / rights (unconfirmed) | Audit usage rights and model/talent releases | Rights expiry, release status, licence |

---

## 4. Competitive landscape

**Table stakes** (most vendors offer these):
1. Start from a selection, collection or lightbox. A folder or search is a close second.
2. PDF output. Many vendors just use the browser's print dialog.
3. Grid density: columns × rows, or "N per page" (typically 6–24).
4. Choose which metadata prints under each thumbnail, either per export or preset by an admin.
5. Filename or title label by default.
6. Page size and orientation.
7. Multi-page output with page breaks.
8. Background generation with an email or in-app notification and a download link (enterprise DAMs).
9. A permission or role controls who can create sheets.

**Best ideas to borrow**:
- **globaledit**:
  - prints an approval checkbox, rating and colour label on the sheet;
  - header/footer text with positioning and pagination formats;
  - watermark toggle;
  - "reduce file size" option;
  - first-page preview;
  - async generation with email and the option to share the sheet with other users.
- **ResourceSpace**:
  - **thumbnails link back to the asset**;
  - logo and title styling;
  - forced watermark;
  - three styles (list, grid, one asset per page);
  - live preview;
  - **saves the sheet back into the DAM as an asset**.
- **Capture One**:
  - header/footer **logo images**;
  - **cover page**;
  - background colour;
  - live multi-page preview;
  - settings remembered between sessions;
  - progressive loading for big sets.
- **Akeneo Digital Showroom**:
  - PDF **and** XLSX;
  - attributes chosen per export from an admin-approved list;
  - admin cover page;
  - product ordering;
  - per-language output;
  - clear quotas (10 per hour, 50 active, files expire after 30 days).
- **Aprimo**: XLSX with embedded thumbnails, generated as a background job.
- **OpenAsset / Portfolio**: saved presets. Portfolio makes "Make PDF" its own permission.
- **Sitecore Content Hub / OTMM**: layouts fully defined by templates (cshtml+css / XSLT). Powerful, but developers have to build them.

**Common weaknesses** (our opening):
- rigid layouts;
- users can't choose fields per export;
- long text overflows or gets cut off;
- browser-print quality;
- large-set limits and a frozen UI while the sheet generates;
- no handling for video or multi-page documents;
- **no links back to the live asset**;
- little branding;
- several vendors have **deprecated or neglected** the feature (Nuxeo, Widen/Acquia).
- **No competitor offers an interactive or canvas output.**

---

## 5. Recommended feature set

Your initial assumption (pick a folder → request a sheet → custom header fields → choose metadata under each preview → PDF) is right. The research adds a few refinements below.

### P0: MVP (table stakes plus top customer requests)
1. **Entry points:** folder, collection, **search result**, and multi-select. Smart collections are a nice extra because the sheet stays up to date. Optionally include subfolders, with a section header per subfolder.
2. **Header fields typed in by the user** (title, date, department, project, requester, confidentiality), plus **automatic fields**: source folder or collection, asset count, generated by and when.
3. **Metadata picker:** choose any fields from the AEM metadata schema, in the order you want. Admins can limit the list of allowed fields. Set the number of lines per field, wrap or truncate, and show or hide labels.
4. **Layout:** page size (Letter, A4, A3, Tabloid, custom), orientation, density preset (e.g. 2×2, 3×4, 4×5, 6×8) or custom columns × rows, fit vs fill (crop), margins and spacing.
5. **Sort and group:** sort by any metadata field or manual order, and group into sections (by subfolder, photographer, status, SKU…).
6. **Header/footer:** logo, page numbers ("Page n of N"), asset sequence numbers.
7. **Live preview** of the first page(s), with estimated page count and file size.
8. **Background generation** that handles thousands of assets: honest progress, splitting very large sheets into numbered volumes, and a notification when done.
9. **Output saved back into AEM** in a "Contact Sheets" folder, linked to its source, and shareable with AEM share links (expiry and password).
10. **Size-smart PDF:** "Screen" (~150 ppi) vs "Print" (~300 ppi) quality.
11. **Permissions:** who can create sheets; respect asset permissions. Exclude expired or restricted assets, or flag them.

### P1: Differentiators
- **Links back to each asset**: clickable thumbnails and/or a QR code. Pick the target by audience: Assets view link for internal users, share or delivery link for external.
- **Status badges on the sheet**: approval status, rating, rights or licence expiry, governance flags.
- **Review-friendly styles**: a "selects" checkbox and notes area per cell; a one-asset-per-page proof style; a list style.
- **Shared, governed templates**: organization templates managed by an admin, plus personal presets and per-folder defaults. Stable across upgrades.
- **Watermark**, text or image, per asset or per page, and forced by policy for some audiences.
- **Cover page** (title, summary, hero image) and a brand theme.
- **Other formats**: XLSX with embedded thumbnails, PPTX (grid or one asset per slide), a web lookbook page.
- **Non-image assets**: video poster frame or keyframe strip, first page or all pages for PDF/INDD, a 3D thumbnail or a placeholder.

### P2: Delighters
- Scheduled or recurring sheets (e.g. a weekly sheet for a smart collection).
- Language-aware output (localized metadata, CJK and right-to-left text).
- Accessible PDF (PDF/UA) and archival PDF/A for regulated or archive customers.
- Password and print restrictions on the PDF (matching Bridge).
- An AI-generated summary on the cover ("42 assets, 3 photographers, 5 expiring in 30 days").
- "Send to Frame.io for review", "Open in Firefly Boards", "Open in Express".

---

## 6. Output formats and keeping it in the Adobe ecosystem

| Output | User value | Adobe-native | Can a backend build it unattended? | Notes |
|---|---|---|---|---|
| **PDF from an HTML template** (PDF Services "Create PDF from HTML") | High | Yes | Yes | The same template drives the live preview. 100 MB max per file, 25–100 requests/min. |
| **PDF from an InDesign template** (InDesign API Data Merge, many records per page, or Custom Scripts) | High (print and brand) | Yes (Firefly Services) | Yes | Best typography and **designer-owned templates**. Needs a Firefly Services entitlement. Output goes to S3, Azure or Dropbox. 1,000 assets per request. |
| PDF from Word (PDF Services Document Generation) | Medium | Yes | Yes | Cheapest, and business users can edit the templates. Grid layouts are awkward. |
| **Web lookbook** (hosted HTML) | High | Yes (AEM share links / Edge Delivery Services) | Yes | Interactive, always current, expiring links. Reuses the HTML template. |
| XLSX with thumbnails / PPTX | Medium | Neutral | Yes | Precedents: Aprimo, Akeneo, OpenAsset. |
| **Frame.io Share** | High (review) | Yes | Yes (v4 `POST /shares`: grid layout, chosen fields, expiry, passphrase, comments) | Assets must be copied into Frame.io. Frame.io → AEM export is built in. |
| **Firefly Boards** | **Highest strategic fit** | Yes | **No: no public API, no AEM import** | For now, only a manual hand-off (caption cards → Creative Cloud storage/library → import into Boards). Boards viewers need an Adobe ID. |
| Adobe Express | Medium | Yes | Partial (Express API is beta, "not for production"; add-ons work only inside the user's open session) | Page-based, not an infinite canvas. Good for "make it pretty / edit it". |
| Our own canvas (App Builder SPA; tldraw or Excalidraw) | Medium–High | Hosted in Adobe | Yes | Layout saved as JSON in AEM. tldraw needs a commercial licence. We'd own an entire canvas product. |
| Miro / FigJam | High (workshops) | No | Miro yes (REST, ~1,000 items/min); FigJam needs a plugin | Data leaves Adobe; images must be public URLs or uploaded. |

**Recommendation**
- **MVP:** HTML template → PDF Services, plus a live HTML preview from the same template.
- **Brand tier:** InDesign API with governed `.indd` templates, offered as "Designer templates".
- **Interactive tier:** web lookbook first, then **"Send to Frame.io Share"** as the Adobe-native interactive, review-ready canvas-like experience.
- **Firefly Boards:** **ask the Boards team for an import API or deep link**. That is the ideal end state.

---

## 7. Proposed architecture (Adobe-native)

```
Assets view / Content Hub  ──(App Builder UI extension: "Create contact sheet")──▶  Config dialog + live preview
                                                                                        │
                                                                     App Builder async job (I/O Runtime, job state)
                                                                                        │
           ┌───────────────── resolve folder / collection / search via AEM Assets APIs; fetch selected metadata
           │                  thumbnails: Dynamic Media delivery URLs (approved) or authenticated renditions (WIP)
           ▼
   Contact-sheet data model (JSON: header, groups, cells[asset, image URL, fields, link, badges])
           │
           ├──▶ HTML template ──▶ PDF Services (HTML→PDF) ──▶ Acrobat Services (compress / protect)   [MVP]
           ├──▶ InDesign API data merge / custom script  ──▶ PDF / INDD                           [brand tier]
           ├──▶ Web lookbook (share link)                                                         [P1]
           ├──▶ XLSX / PPTX                                                                       [P1]
           └──▶ Frame.io Share │ Firefly Boards hand-off │ Miro                                    [P2]
                                                                                        │
                          Save output into AEM ("Contact Sheets" folder, linked to source) → inbox notification → share link
```

---

## 8. Risks and open questions

1. **Firefly Boards has no API or AEM import.** The most Adobe-native canvas can't be built today. This needs a conversation with the Boards product team.
2. **Assets view UI extensibility is Assets Ultimate only** and enabled by support ticket. Other tiers need another entry point: Content Hub extension, a standalone app using the Asset Selector, or an agent/chat skill.
3. **Dynamic Media OpenAPI delivers approved assets only.** Work-in-progress sheets need authenticated rendition fetches, and links in the PDF may not open for external recipients.
4. **App Builder limits:**
   - 22 MB code size, so Chromium can't be bundled;
   - 1 MB response;
   - 600 MB local disk;
   - 1-minute web actions.

   So generation must be an async job that stores its output, and large sheets must be split.
5. **Entitlements:** InDesign API and Firefly Services are separate licences. The Express API is beta.
6. **Freshness and correctness (Sam's Club lesson):** stale or duplicate-filename images and premature "success" status. Use asset IDs rather than filenames, render from current renditions, and report status truthfully.
7. **Fonts and internationalization:** CJK and right-to-left text in metadata can silently render as empty boxes.
8. **Accessibility cost:** PDF Services auto-tagging is expensive (10 transactions per page, max 200 pages). Generate tagged output from the template instead.
9. **Open:** whether AEM already stores per-page renditions for PDF/INDD; the actual async timeout for App Builder; whether rights/legal review is a real persona (validate in interviews).

---

## 9. Key sources

**AEM / internal**
- Experience League: "Export Contact sheets from Adobe Assets": https://experienceleaguecommunities.adobe.com/adobe-experience-manager-assets-9/export-contact-sheets-from-adobe-assets-229696
- 3|SHARE custom contact sheet on AEM: https://blog.3sharecorp.com/how-to-use-aem-assets-part-2
- ACS AEM Commons InDesign Dynamic Deck: https://adobe-consulting-services.github.io/acs-aem-commons/features/indesign-dynamic-deck/index.html
- Slack: #guild-aem-assets (2024-08-08, 2026-11-05), #dsg-csc (2026-01-27), #sams-club-csc-team (2026-08-05, 2026-09-09), #samsclub-team (2026-11-11), Lenovo channel (2026-11-12)

**Competitors**
- Canto: https://support.canto.com/hc/en-us/articles/23002071660689
- Bynder: https://help.bynder.com/en/215899-create-and-export-assets-as-a-contact-sheet.html
- Brandfolder: https://help.smartsheet.com/articles/2482956-Contact-Sheets
- globaledit: https://support.globaledit.com/hc/en-us/articles/360046787711
- ResourceSpace: https://www.resourcespace.com/knowledge-base/user/contact-sheet
- OpenAsset: https://success.openasset.com/en/articles/3072665-using-contact-sheets
- Asset Bank: https://support.assetbank.co.uk/hc/en-gb/articles/115006045747
- Portfolio: https://helpdocs.portfoliodam.com/client/pdf-contact-sheets
- Daminion: https://daminion.net/docs/creating-a-contact-sheet-in-pdf
- Akeneo: https://help.akeneo.com/understanding-the-digital-showroom/export-products-to-pdf
- Sitecore Content Hub: https://doc.sitecore.com/ch/users/content-hub/en/generate-pdf-from-templates.html
- Capture One: https://support.captureone.com/hc/en-us/articles/31355885087517

**Adobe tools and building blocks**
- Bridge PDF contact sheet: https://helpx.adobe.com/bridge/desktop/fix-and-prep-photos/create-pdf-contact-sheet-in-the-output-workspace.html
- Photoshop Contact Sheet II: https://helpx.adobe.com/photoshop/desktop/app-integrations/create-a-contact-sheet.html
- Lightroom Classic print layouts: https://helpx.adobe.com/lightroom-classic/desktop/print-photos/print-module-layouts-templates.html
- InDesign API: https://developer.adobe.com/firefly-services/docs/indesign-apis/
- PDF Services limits: https://developer.adobe.com/document-services/docs/overview/limits
- Frame.io v4 create share: https://developer.frame.io/platform/v4/api-reference/shares/create
- Firefly Boards: https://helpx.adobe.com/firefly/web/create-mood-boards/firefly-boards/about-firefly-boards.html
- Request for AEM ↔ Firefly Boards integration: https://community.adobe.com/feature-requests-405/connect-images-that-live-in-aem-to-firefly-board-and-have-the-ability-to-send-a-file-directly-to-an-existing-indesign-or-illustrator-file-in-aem-from-the-firefly-board-1643140
- Assets view UI extensibility: https://developer.adobe.com/uix/docs/services/aem-assets-view/api/
- Content Hub what's new: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/content-hub/whats-new
- App Builder system limits: https://developer.adobe.com/app-builder/docs/guides/runtime_guides/system-settings
