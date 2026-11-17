// GET /status?jobId=...&includeModel=true — poll resolve or generate job status (scoped to the calling user),
// or proxy-download an AEM asset binary (`?downloadAssetId=urn:aaid:aem:...&fileName=...&aemHost=...`).
import { errorResponse, extractAuth, jsonResponse } from '../lib/utils.js';
import { getPresignedDownloadUrl, loadJob, loadPdfChunk, readFileObject } from '../lib/store.js';

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    // Fast chunked PDF binary retrieval from App Builder State (0-second wait without waiting for AEM Smart Tagging)
    if (params.pdfJobId && params.chunk !== undefined) {
      const chunkBase64 = await loadPdfChunk(params.pdfJobId, Number(params.chunk));
      if (!chunkBase64) {
        return errorResponse(404, 'CHUNK_NOT_FOUND', 'PDF chunk not found.');
      }
      return jsonResponse(200, { chunk: Number(params.chunk), chunkBase64 });
    }

    if (params.downloadAssetId) {
      const aemHost = (params.aemHost || 'https://author-p59602-e520244.adobeaemcloud.com').replace(/\/+$/, '');
      const fileName = params.fileName || 'contact-sheet.pdf';

      // 1. Check `/adobe/assets/{id}/original/as/{fileName}` (originally uploaded binary — available immediately before microservices/indexing!)
      // and `/adobe/assets/{id}/renditions/original/as/{fileName}` for a 302 Location pre-signed blob URL
      for (const pathSuffix of [
        `/adobe/assets/${encodeURIComponent(params.downloadAssetId)}/original/as/${encodeURIComponent(fileName)}`,
        `/adobe/assets/${encodeURIComponent(params.downloadAssetId)}/renditions/original/as/${encodeURIComponent(fileName)}`,
      ]) {
        try {
          const origRes = await fetch(`${aemHost}${pathSuffix}`, {
            method: 'GET',
            redirect: 'manual',
            headers: {
              Authorization: `Bearer ${auth.bearerToken}`,
              'x-api-key': auth.apiKey,
              'x-gw-ims-org-id': auth.imsOrg,
            },
          });
          const loc = origRes.headers?.get?.('location') || '';
          if (loc && loc.startsWith('https://')) {
            return jsonResponse(200, {
              ready: true,
              fileName,
              downloadUrl: loc,
            });
          }
        } catch {
          // Try next
        }
      }

      // 2. Try to get a pre-signed blob downloadUrl from AEM search
      try {
        const sRes = await fetch(
          `${aemHost}/adobe/experimental/aemmcpserver-expires-20991231/search-assets`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${auth.bearerToken}`,
              'x-api-key': auth.apiKey,
              'x-gw-ims-org-id': auth.imsOrg,
              'X-Adobe-Accept-Experimental': '1',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              termFilters: [{ key: 'repositoryMetadata.repo:name', value: fileName }],
              limit: 10,
            }),
          }
        );
        if (sRes.ok) {
          const sJson = await sRes.json();
          const match = (sJson?.results || []).find((x) => x.assetId === params.downloadAssetId) || sJson?.results?.[0];
          if (match?.downloadUrl) {
            return jsonResponse(200, {
              ready: true,
              fileName,
              downloadUrl: match.downloadUrl,
            });
          }
        }
      } catch {
        // Fall through
      }

      // Check if asset metadata is processed and ready
      const metaRes = await fetch(
        `${aemHost}/adobe/assets/${encodeURIComponent(params.downloadAssetId)}/metadata`,
        {
          headers: {
            Authorization: `Bearer ${auth.bearerToken}`,
            'x-api-key': auth.apiKey,
            'x-gw-ims-org-id': auth.imsOrg,
          },
        }
      );
      if (!metaRes.ok) {
        return jsonResponse(200, { ready: false });
      }
      return jsonResponse(200, { ready: false, indexedPending: true });
    }

    const jobId = params.jobId;
    if (!jobId) {
      return errorResponse(400, 'MISSING_JOB_ID', 'Query parameter jobId is required.');
    }

    const job = await loadJob(jobId);
    if (!job) {
      return errorResponse(404, 'JOB_NOT_FOUND', `Job ${jobId} not found.`);
    }

    if (job.userHash && job.userHash !== auth.userHash) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this job.');
    }

    const responseBody = { ...job };
    if (job.result?.modelFileKey) {
      if (params.includeModel === 'true' || params.includeModel === true) {
        const raw = await readFileObject(job.result.modelFileKey, true);
        if (raw && raw.length < 900_000) {
          responseBody.model = JSON.parse(raw);
        } else {
          responseBody.modelUrl = await getPresignedDownloadUrl(job.result.modelFileKey, 3600);
        }
      } else {
        responseBody.modelUrl = await getPresignedDownloadUrl(job.result.modelFileKey, 3600);
      }
    }

    return jsonResponse(200, responseBody);
  } catch (err) {
    return errorResponse(500, 'STATUS_FAILED', err.message || 'Failed reading job status', true);
  }
}
