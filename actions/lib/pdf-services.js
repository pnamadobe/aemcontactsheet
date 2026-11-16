// Adobe PDF Services REST client (HTML ZIP -> PDF) using Server-to-Server OAuth credentials.

const PDF_SERVICES_BASE = 'https://pdf-services.adobe.io';
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

export async function getServerToServerToken({
  clientId,
  clientSecret,
  scopes = 'openid,AdobeID,DCAPI',
  fetchImpl = globalThis.fetch,
}) {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: scopes,
  });

  const res = await fetchImpl(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IMS token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Convert a ZIP containing `index.html` + images into a PDF Buffer via Adobe PDF Services REST API.
 */
export async function convertHtmlZipToPdf({
  zipBuffer,
  pageWidthIn,
  pageHeightIn,
  clientId,
  clientSecret,
  accessToken = null,
  fetchImpl = globalThis.fetch,
}) {
  if (!clientId || (!clientSecret && !accessToken)) {
    const err = new Error(
      'PDF Services credentials (PDF_SERVICES_CLIENT_ID / PDF_SERVICES_CLIENT_SECRET) are not configured on this workspace.'
    );
    err.code = 'PDF_SERVICES_CREDENTIALS_MISSING';
    throw err;
  }

  const token = accessToken || (await getServerToServerToken({ clientId, clientSecret, fetchImpl }));
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
  };

  // 1. Request upload pre-signed URI for application/zip
  const assetRes = await fetchImpl(`${PDF_SERVICES_BASE}/assets`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ mediaType: 'application/zip' }),
  });
  if (!assetRes.ok) {
    const t = await assetRes.text().catch(() => '');
    throw new Error(`PDF Services /assets failed (${assetRes.status}): ${t.slice(0, 200)}`);
  }
  const { assetID, uploadUri } = await assetRes.json();

  // 2. PUT the ZIP archive
  const putRes = await fetchImpl(uploadUri, {
    method: 'PUT',
    headers: { 'content-type': 'application/zip' },
    body: zipBuffer,
  });
  if (!putRes.ok) {
    throw new Error(`PDF Services ZIP upload failed (${putRes.status})`);
  }

  // 3. Submit HTML-to-PDF job
  const jobRes = await fetchImpl(`${PDF_SERVICES_BASE}/operation/htmltopdf`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      assetID,
      includeHeaderFooter: false,
      pageLayout: {
        pageWidth: Number(pageWidthIn),
        pageHeight: Number(pageHeightIn),
      },
      waitTimeToLoad: 500,
    }),
  });
  if (jobRes.status !== 201 && !jobRes.ok) {
    const t = await jobRes.text().catch(() => '');
    throw new Error(`PDF Services /operation/htmltopdf failed (${jobRes.status}): ${t.slice(0, 240)}`);
  }

  const pollLocation = jobRes.headers.get('location') || jobRes.headers.get('Location');
  if (!pollLocation) {
    throw new Error('PDF Services did not return a polling Location header');
  }

  // 4. Poll until status === 'done'
  let downloadUri = null;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetchImpl(pollLocation, { headers: authHeaders });
    if (!statusRes.ok) {
      throw new Error(`PDF Services status poll failed (${statusRes.status})`);
    }
    const statusBody = await statusRes.json();
    if (statusBody.status === 'done') {
      downloadUri = statusBody.asset?.downloadUri;
      break;
    }
    if (statusBody.status === 'failed') {
      throw new Error(
        `PDF Services conversion failed: ${statusBody.error?.message || JSON.stringify(statusBody.error || {})}`
      );
    }
  }

  if (!downloadUri) {
    throw new Error('PDF Services conversion timed out');
  }

  // 5. Download finished PDF
  const pdfRes = await fetchImpl(downloadUri);
  if (!pdfRes.ok) {
    throw new Error(`Failed downloading generated PDF (${pdfRes.status})`);
  }
  const ab = await pdfRes.arrayBuffer();
  return Buffer.from(ab);
}
