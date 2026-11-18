// GET /status?jobId=...&includeModel=true — poll resolve or generate job status (scoped to the calling user),
// or proxy-download an AEM asset binary (`?downloadAssetId=urn:aaid:aem:...&fileName=...&aemHost=...`).
import { errorResponse, extractAuth, jsonResponse, resolveAemHosts } from '../lib/utils.js';
import { getPresignedDownloadUrl, listRecentJobs, loadJob, loadPdfChunk, readFileObject } from '../lib/store.js';

function isJobOwnedByCaller(job, auth) {
  if (!job) return false;
  if (job.userHash && job.userHash !== auth.userHash) return false;
  if (job.orgId && auth.imsOrg && job.orgId !== auth.imsOrg) return false;
  return true;
}

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    if (params.mode === 'recentJobs') {
      const jobs = await listRecentJobs(Number(params.limit) || 5, {
        userHash: auth.userHash,
        orgId: auth.imsOrg,
      });
      return jsonResponse(200, { jobs });
    }

    // Fast chunked PDF binary retrieval from App Builder State (scoped to the job owner)
    if (params.pdfJobId && params.chunk !== undefined) {
      const parentJob = await loadJob(params.pdfJobId);
      if (!parentJob) {
        return errorResponse(404, 'JOB_NOT_FOUND', `Job ${params.pdfJobId} not found.`);
      }
      if (!isJobOwnedByCaller(parentJob, auth)) {
        return errorResponse(403, 'FORBIDDEN', 'You do not have access to this job.');
      }
      const chunkBase64 = await loadPdfChunk(params.pdfJobId, Number(params.chunk));
      if (!chunkBase64) {
        return errorResponse(404, 'CHUNK_NOT_FOUND', 'PDF chunk not found.');
      }
      return jsonResponse(200, { chunk: Number(params.chunk), chunkBase64 });
    }

    if (params.downloadAssetId && params.sliceIndex !== undefined) {
      let aemHost;
      try {
        ({ aemHost } = resolveAemHosts(params));
      } catch (hostErr) {
        return errorResponse(hostErr.statusCode || 400, hostErr.code || 'INVALID_AEM_HOST', hostErr.message);
      }
      const fileName = params.fileName || 'contact-sheet.pdf';
      const sliceIndex = Math.max(0, Number(params.sliceIndex) || 0);
      const sliceSize = Math.min(500_000, Math.max(100_000, Number(params.sliceSize) || 480_000));
      const start = sliceIndex * sliceSize;
      const end = start + sliceSize - 1;

      const origRes = await fetch(
        `${aemHost}/adobe/assets/${encodeURIComponent(params.downloadAssetId)}/original/as/${encodeURIComponent(fileName)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${auth.bearerToken}`,
            'x-api-key': auth.apiKey,
            'x-gw-ims-org-id': auth.imsOrg,
            Range: `bytes=${start}-${end}`,
          },
        }
      );
      if (!origRes.ok && origRes.status !== 206) {
        return errorResponse(origRes.status, 'ORIGINAL_NOT_READY', `Original binary returned ${origRes.status}`);
      }
      const ab = await origRes.arrayBuffer();
      const buf = Buffer.from(ab);
      const sliceBuf =
        origRes.status === 206 && buf.byteLength <= sliceSize + 1024
          ? buf
          : buf.subarray(start, start + sliceSize);
      return jsonResponse(200, {
        ready: true,
        sliceIndex,
        sliceBase64: sliceBuf.toString('base64'),
        sliceBytes: sliceBuf.byteLength,
      });
    }

    if (params.downloadAssetId) {
      let aemHost;
      try {
        ({ aemHost } = resolveAemHosts(params));
      } catch (hostErr) {
        return errorResponse(hostErr.statusCode || 400, hostErr.code || 'INVALID_AEM_HOST', hostErr.message);
      }
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

    if (!isJobOwnedByCaller(job, auth)) {
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
