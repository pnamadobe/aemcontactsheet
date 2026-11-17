// POST /generate — validate config + model reference, create generate job, and asynchronously invoke generate-worker.
import { errorResponse, extractAuth, jsonResponse, newJobId } from '../lib/utils.js';
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
    const aemHost = params.aemHost || model?.aemHost || params.DEFAULT_AEM_HOST || 'https://author-p59602-e520244.adobeaemcloud.com';
    const deliveryHost = params.deliveryHost || model?.deliveryHost || params.DEFAULT_DELIVERY_HOST || 'https://delivery-p59602-e520244.adobeaemcloud.com';
    const jobId = newJobId('gen');
    const now = new Date().toISOString();

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

    const workerPayload = {
      jobId,
      modelFileKey,
      inlineModel: model || null,
      config,
      outputFormat: params.outputFormat || config?.output?.format || 'pdf', // 'pdf' | 'boards'
      tier,
      aemHost,
      deliveryHost,
      auth,
      PDF_SERVICES_CLIENT_ID: params.PDF_SERVICES_CLIENT_ID || process.env.PDF_SERVICES_CLIENT_ID,
      PDF_SERVICES_CLIENT_SECRET: params.PDF_SERVICES_CLIENT_SECRET || process.env.PDF_SERVICES_CLIENT_SECRET,
      AEM_TECH_CLIENT_ID: params.AEM_TECH_CLIENT_ID || process.env.AEM_TECH_CLIENT_ID,
      AEM_TECH_CLIENT_SECRET: params.AEM_TECH_CLIENT_SECRET || process.env.AEM_TECH_CLIENT_SECRET,
      AEM_TECH_SCOPES: params.AEM_TECH_SCOPES || process.env.AEM_TECH_SCOPES,
    };

    const runSync = params.sync !== false;
    if (runSync) {
      const doneJob = await generateWorkerMain(workerPayload);
      return jsonResponse(200, { ...doneJob, jobId: doneJob.id || jobId });
    }

    await invokeWorkerAsync('generate-worker', workerPayload, generateWorkerMain);
    return jsonResponse(202, { jobId, status: job.status });
  } catch (err) {
    return errorResponse(500, 'GENERATE_INIT_FAILED', err.message || 'Failed starting generate job', true);
  }
}
