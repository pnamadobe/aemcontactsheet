// GET /status?jobId=...&includeModel=true — poll resolve or generate job status (scoped to the calling user).
import { errorResponse, extractAuth, jsonResponse } from '../lib/utils.js';
import { getPresignedDownloadUrl, loadJob, readFileObject } from '../lib/store.js';

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
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
