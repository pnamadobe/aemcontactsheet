// Internal demo generate-worker — handles Firefly Boards ('boards') and Adobe Express ('express')
// cloud-canvas exports, and delegates PDF contact-sheet rendering to `actions/generate-worker/index.js`.
import { paginate } from '../../../packages/core/layout.js';
import { createAemClient } from '../../../actions/lib/aem.js';
import { loadJob, readFileObject, saveJob } from '../../../actions/lib/store.js';
import { main as pdfGenerateWorkerMain, buildPdfFileName } from '../../../actions/generate-worker/index.js';
import { exportContactSheetToFireflyBoard } from '../lib/firefly-boards.js';
import { exportContactSheetToAdobeExpress } from '../lib/adobe-express.js';

export { buildPdfFileName };

export async function main(params = {}) {
  const {
    jobId,
    modelFileKey,
    inlineModel,
    config,
    aemHost,
    deliveryHost,
    auth = {},
    fetchImpl = globalThis.fetch,
  } = params;

  const outputFormat = params.outputFormat || config?.output?.format || 'pdf';
  if (outputFormat !== 'boards' && outputFormat !== 'express') {
    return pdfGenerateWorkerMain(params);
  }

  const job = {
    ...(await loadJob(jobId)),
    id: jobId,
    type: 'generate',
    userId: auth.userId,
    userHash: auth.userHash,
    orgId: auth.imsOrg,
    warnings: [],
    createdAt: new Date().toISOString(),
  };

  try {
    job.status = 'running';
    job.phase = outputFormat;
    await saveJob(job);

    let model = inlineModel;
    if (!model && modelFileKey) {
      const rawJson = await readFileObject(modelFileKey, true);
      if (!rawJson) throw new Error(`Resolved model not found at ${modelFileKey}`);
      model = JSON.parse(rawJson);
    }

    const paginated = paginate(model, config);
    const warnings = [...paginated.warnings];

    const aem = createAemClient({
      aemHost: aemHost || model.aemHost,
      deliveryHost: deliveryHost || model.deliveryHost,
      bearerToken: auth.bearerToken,
      imsOrg: auth.imsOrg,
      apiKey: auth.apiKey,
      fetchImpl,
    });

    if (outputFormat === 'boards') {
      const boardRes = await exportContactSheetToFireflyBoard({
        model,
        config,
        aem,
        bearerToken: String(params.boardsBearerToken || '').trim().replace(/^Bearer\s+/i, '') || auth.bearerToken,
        shareEmail: params.boardsShareEmail || auth.userEmail || null,
        fetchImpl,
        onProgress: async (done, total) => {
          job.progress = { done, total };
          await saveJob(job);
        },
      });

      job.status = boardRes.warnings.length ? 'succeeded_with_warnings' : 'succeeded';
      job.phase = 'done';
      job.warnings = boardRes.warnings;
      job.result = {
        outputFormat: 'boards',
        boardId: boardRes.boardId,
        boardUrl: boardRes.boardUrl,
        placedCards: boardRes.placedCards,
        assets: boardRes.totalAssets,
      };
      await saveJob(job);
      return job;
    }

    // outputFormat === 'express'
    const targetToken =
      String(params.boardsBearerToken || '').trim().replace(/^Bearer\s+/i, '') || auth.bearerToken;
    const shareEmails = [params.boardsShareEmail, auth.userEmail].filter(Boolean);
    try {
      const expressRes = await exportContactSheetToAdobeExpress({
        jobId,
        paginated,
        model,
        aem,
        bearerToken: targetToken,
        shareWithEmails: shareEmails,
        fetchImpl,
        onProgress: async (done, total) => {
          job.progress = { done, total };
          await saveJob(job);
        },
      });
      job.status = warnings.length ? 'succeeded_with_warnings' : 'succeeded';
      job.phase = 'done';
      job.warnings = warnings;
      job.result = {
        outputFormat: 'express',
        expressMode: 'direct',
        documentId: expressRes.documentId,
        expressUrl: expressRes.expressUrl,
        sharedLinkEnabled: expressRes.sharedLinkEnabled,
        sharedWith: expressRes.sharedWith,
        pages: expressRes.pages,
        assets: expressRes.placedAssets,
      };
      await saveJob(job);
      return job;
    } catch (expressErr) {
      const reason =
        expressErr.code === 'TOKEN_EXPIRED'
          ? 'Your saved token for the target IMS Org has expired — please paste a fresh token in Target IMS Org / Profile.'
          : expressErr.code === 'UserNotEntitled'
          ? 'The selected IMS Org is not entitled to Adobe Express — select your Express-entitled Target IMS Org token.'
          : expressErr.message || expressErr.code || 'direct cloud creation requires an Express/Firefly token in Target IMS Org';
      return pdfGenerateWorkerMain({
        ...params,
        extraWarnings: [`Prepared editable multi-page PDF for Adobe Express import (${reason})`],
        extraResultFields: {
          outputFormat: 'express',
          expressMode: 'pdf_import',
          expressUrl: 'https://new.express.adobe.com/',
        },
      });
    }
  } catch (err) {
    job.status = 'failed';
    job.warnings = job.warnings || [];
    job.error = {
      code: err.code || 'GENERATE_FAILED',
      message: err.message || 'Failed generating cloud-canvas export',
      retryable: err.retryable !== false,
    };
    await saveJob(job);
    return job;
  }
}
