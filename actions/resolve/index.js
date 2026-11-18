// POST /resolve — validate source, create a resolve job record, and asynchronously invoke resolve-worker.
import { errorResponse, extractAuth, jsonResponse, newJobId, resolveAemHosts } from '../lib/utils.js';
import { saveJob } from '../lib/store.js';
import { invokeWorkerAsync } from '../lib/invoke.js';
import { main as resolveWorkerMain } from '../resolve-worker/index.js';

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const source = params.source;
    if (!source || !source.kind) {
      return errorResponse(400, 'INVALID_SOURCE', 'Request must include a valid source ({ kind, id, path, ... }).');
    }

    const tier = params.tier || 'author';
    let aemHost;
    let deliveryHost;
    try {
      ({ aemHost, deliveryHost } = resolveAemHosts(params));
    } catch (hostErr) {
      return errorResponse(hostErr.statusCode || 400, hostErr.code || 'INVALID_AEM_HOST', hostErr.message);
    }
    const jobId = newJobId('res');
    const now = new Date().toISOString();

    const job = {
      id: jobId,
      type: 'resolve',
      userId: auth.userId,
      userHash: auth.userHash,
      orgId: auth.imsOrg,
      status: 'queued',
      phase: 'listing',
      progress: { done: 0, total: 0 },
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveJob(job);

    const workerPayload = {
      jobId,
      source,
      tier,
      aemHost,
      deliveryHost,
      maxAssets: Number(params.maxAssets) || 500,
      auth,
    };

    const runSync = params.sync !== false;
    if (runSync) {
      const doneJob = await resolveWorkerMain({ ...workerPayload, returnModelInline: true });
      return jsonResponse(200, {
        jobId,
        status: doneJob.status,
        warnings: doneJob.warnings || [],
        result: doneJob.result || {},
        model: doneJob.inlineModel || null,
        error: doneJob.error || null,
      });
    }

    await invokeWorkerAsync('resolve-worker', workerPayload, resolveWorkerMain);
    return jsonResponse(202, { jobId, status: job.status });
  } catch (err) {
    return errorResponse(500, 'RESOLVE_INIT_FAILED', err.message || 'Failed starting resolve job', true);
  }
}
