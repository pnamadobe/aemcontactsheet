# Administrator Setup & Configuration Guide — AEM Assets Contact Sheets

This guide explains how enterprise administrators install, configure, and govern the **AEM Assets Contact Sheets** extension across **AEM Assets View (`aem/assets/assetsview/1`)** and **AEM Content Hub (`aem/assets/contenthub/1`)**.

---

## 1. Prerequisites

- **Adobe Experience Manager as a Cloud Service (AEMaaCS)** with:
  - **AEM Assets View** (`https://experience.adobe.com/?repoId=author-p<program>-e<env>.adobeaemcloud.com`) and/or
  - **AEM Content Hub** (`https://experience.adobe.com/?repoId=delivery-p<program>-e<env>.adobeaemcloud.com` with Dynamic Media with OpenAPI enabled)
- **Adobe App Builder** entitlement in your IMS Organization (or installation via **Adobe Exchange**).

---

## 2. Out-of-the-Box Zero-Configuration Mode

The extension works immediately upon installation with **zero external API keys required**:
- **Environment Auto-Discovery:** Automatically detects the customer's `author-p<program>-e<env>.adobeaemcloud.com` and `delivery-p<program>-e<env>.adobeaemcloud.com` hosts from the Experience Cloud host context.
- **Native Vector PDF Engine (`pdf-lib` + `@pdf-lib/fontkit`):** Generates high-resolution, searchable vector PDF contact sheets with clickable AEM deep-link annotations, custom `.ttf`/`.otf` DAM font embedding for watermarks, status badges, and page themes without requiring an external PDF Services subscription.
- **Caller-Scoped AEM Permissions:** All asset queries, rendition fetches, and PDF uploads execute using the signed-in user's own IMS Bearer token, respecting existing AEM folder ACLs. If a user is read-only, the extension automatically provides a direct browser download without failing.

---

## 3. Optional Enterprise Environment Variables (`.env` / App Builder Inputs)

Administrators deploying a dedicated App Builder workspace can optionally configure the following inputs in `.env` (see `app.config.yaml`):

| Variable | Required? | Description |
|---|---|---|
| `DEFAULT_AEM_HOST` | Optional | Fallback AEM Author URL (e.g., `https://author-p12345-e67890.adobeaemcloud.com`) if not provided by the host iframe URL. |
| `DEFAULT_DELIVERY_HOST` | Optional | Fallback AEM Delivery URL (e.g., `https://delivery-p12345-e67890.adobeaemcloud.com`). Automatically derived from `author-p<program>-e<env>` when omitted. |
| `ALLOWED_AEM_HOSTS` | Optional | Comma-separated list of custom vanity AEM hostnames permitted by the SSRF host validator (in addition to `*.adobeaemcloud.com` and `*.adobecqms.net`). |
| `PDF_SERVICES_CLIENT_ID` / `PDF_SERVICES_CLIENT_SECRET` | Optional | When provided, `generate-worker` uses **Adobe PDF Services HTML-to-PDF** API instead of the built-in native vector PDF renderer. |
| `AEM_TECH_CLIENT_ID` / `AEM_TECH_CLIENT_SECRET` / `AEM_TECH_SCOPES` | Optional | Server-to-Server technical account credentials used when saving an archival copy of contact sheets generated from **AEM Content Hub** back to AEM Author (`/content/dam/contact-sheets/content-hub/{yyyy}/{mm}/`). |

---

## 4. Custom Watermark Fonts in AEM DAM

To make custom brand fonts available in the **Watermark → Font family** dropdown (both in the Live Preview and embedded into generated PDFs):
1. Upload `.ttf` or `.otf` font files to `/content/dam/fonts` (or any DAM folder—the extension automatically discovers fonts by MIME type `font/ttf`, `font/otf`, `font/woff`, `font/woff2` across the DAM).
2. Ensure authors have read permission on those font assets.
