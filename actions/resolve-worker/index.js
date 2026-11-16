// Background worker that resolves folder / collection / selection assets into a SheetModel in App Builder Files.
import { buildSheetModel } from '../../packages/core/model.js';
import { createAemClient } from '../lib/aem.js';
import { loadJob, saveJob, writeFileObject } from '../lib/store.js';

export async function main(params = {}) {
  const {
    jobId,
    source,
    tier = 'author',
    aemHost,
    deliveryHost,
    maxAssets = 500,
    auth = {},
    fetchImpl = globalThis.fetch,
  } = params;

  const job = {
    ...(await loadJob(jobId)),
    id: jobId,
    type: 'resolve',
    userId: auth.userId,
    userHash: auth.userHash,
    orgId: auth.imsOrg,
    warnings: [],
    createdAt: new Date().toISOString(),
  };

  try {
    job.status = 'running';
    job.phase = 'listing';
    await saveJob(job);

    const aem = createAemClient({
      aemHost,
      deliveryHost,
      bearerToken: auth.bearerToken,
      imsOrg: auth.imsOrg,
      apiKey: auth.apiKey,
      fetchImpl,
    });

    let rawAssets = [];
    let sourceLabel = source.path || source.name || source.id || 'Selection';

    const onProgress = async (done, total) => {
      if (done === total || done % 10 === 0) {
        job.phase = 'metadata';
        job.progress = { done, total };
        await saveJob(job);
      }
    };

    if (source.kind === 'folder') {
      const res = await aem.resolveFolderAssets({
        folderId: source.id,
        folderPath: source.path,
        includeSubfolders: Boolean(source.includeSubfolders),
      });
      rawAssets = res.assets;
      sourceLabel = res.folderPath || source.path || source.id;
    } else if (source.kind === 'collection') {
      const res = await aem.resolveCollectionAssets({
        collectionId: source.id,
        tier,
        onProgress,
      });
      rawAssets = res.assets;
      sourceLabel = `Collection: ${res.collectionTitle || source.name || source.id}`;
    } else if (source.kind === 'selection') {
      rawAssets = await aem.resolveSelectionAssets({
        items: source.items || [],
        tier,
        includeSubfolders: Boolean(source.includeSubfolders),
        onProgress,
      });
      sourceLabel = `Selection (${rawAssets.length} items)`;
    } else {
      throw new Error(`Unsupported source kind: ${source.kind}`);
    }

    const model = buildSheetModel({
      rawAssets,
      source,
      sourceLabel,
      tier,
      aemHost,
      deliveryHost,
      resolvedBy: auth.userEmail || auth.userId,
      maxAssets,
    });

    const modelJsonStr = JSON.stringify(model);
    const modelFileKey = `models/${auth.imsOrg}/${auth.userHash}/${jobId}.json`;
    await writeFileObject(modelFileKey, modelJsonStr);

    job.status = model.warnings.length ? 'succeeded_with_warnings' : 'succeeded';
    job.phase = 'done';
    job.progress = { done: model.assets.length, total: model.totalFound };
    job.warnings = model.warnings;
    job.result = {
      modelFileKey,
      totalFound: model.assets.length ? model.totalFound : 0,
      resolvedCount: model.assets.length,
      truncated: model.truncated,
    };
    await saveJob(job);
    if (params.returnModelInline && modelJsonStr.length < 900_000) {
      return { ...job, inlineModel: model };
    }
    return job;
  } catch (err) {
    job.status = 'failed';
    job.error = {
      code: err.code || 'RESOLVE_FAILED',
      message: err.message || 'Failed resolving source assets',
      retryable: err.retryable !== false,
    };
    await saveJob(job);
    return job;
  }
}
