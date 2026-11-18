// POST /generate — validate config + model reference, create generate job, and asynchronously invoke generate-worker.
import { errorResponse, extractAuth, jsonResponse, newJobId, resolveAemHosts } from '../lib/utils.js';
import { saveJob } from '../lib/store.js';
import { invokeWorkerAsync } from '../lib/invoke.js';
import { main as generateWorkerMain } from '../generate-worker/index.js';

export async function main(params = {}) {
  try {
    const auth = extractAuth(params);
    if (!auth.bearerToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing IMS Bearer token.');
    }

    const { modelFileKey, model, config } = params;
    if (!modelFileKey && !model) {
      return errorResponse(400, 'MISSING_MODEL', 'Request must include modelFileKey or inline model.');
    }
    if (!config || !config.header?.title) {
      return errorResponse(400, 'INVALID_CONFIG', 'ContactSheetConfig with header.title is required.');
    }

    const tier = params.tier || model?.tier || 'author';
    let aemHost;
    let deliveryHost;
    try {
      ({ aemHost, deliveryHost } = resolveAemHosts(params, model));
    } catch (hostErr) {
      return errorResponse(hostErr.statusCode || 400, hostErr.code || 'INVALID_AEM_HOST', hostErr.message);
    }
    const jobId = newJobId('gen');
    const now = new Date().toISOString();

    const outputFormat = params.outputFormat || config?.output?.format || 'pdf';
    if (outputFormat !== 'pdf') {
      return errorResponse(400, 'UNSUPPORTED_OUTPUT_FORMAT', `Unsupported outputFormat "${outputFormat}". Only "pdf" is supported in this deployment.`);
    }

    const job = {
      id: jobId,
      type: 'generate',
      userId: auth.userId,
      userHash: auth.userHash,
      orgId: auth.imsOrg,
      status: 'queued',
      phase: 'images',
      progress: { done: 0, total: 0 },
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveJob(job);

    // Do not copy PDF_SERVICES_CLIENT_SECRET or AEM_TECH_CLIENT_SECRET into async OpenWhisk activation params;
    // `generate-worker` reads its own deployment inputs directly when invoked asynchronously.
    const workerPayload = {
      jobId,
      modelFileKey,
      inlineModel: model || null,
      config,
      outputFormat: 'pdf',
      tier,
      aemHost,
      deliveryHost,
      auth,
    };

    const assetCount = model?.assets?.length || 0;
    const runSync = params.sync === true || (params.sync !== false && assetCount <= 60);
    if (runSync) {
      const doneJob = await generateWorkerMain({
        ...workerPayload,
        PDF_SERVICES_CLIENT_ID: params.PDF_SERVICES_CLIENT_ID || process.env.PDF_SERVICES_CLIENT_ID,
        PDF_SERVICES_CLIENT_SECRET: params.PDF_SERVICES_CLIENT_SECRET || process.env.PDF_SERVICES_CLIENT_SECRET,
        AEM_TECH_CLIENT_ID: params.AEM_TECH_CLIENT_ID || process.env.AEM_TECH_CLIENT_ID,
        AEM_TECH_CLIENT_SECRET: params.AEM_TECH_CLIENT_SECRET || process.env.AEM_TECH_CLIENT_SECRET,
        AEM_TECH_SCOPES: params.AEM_TECH_SCOPES || process.env.AEM_TECH_SCOPES,
      });
      return jsonResponse(200, { ...doneJob, jobId: doneJob.id || jobId });
    }

    await invokeWorkerAsync('generate-worker', workerPayload, generateWorkerMain);
    return jsonResponse(202, { jobId, status: job.status });
  } catch (err) {
    return errorResponse(500, 'GENERATE_INIT_FAILED', err.message || 'Failed starting generate job', true);
  }
}
