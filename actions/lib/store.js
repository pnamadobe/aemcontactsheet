// Wrapper around @adobe/aio-lib-state and @adobe/aio-lib-files with automatic local-filesystem fallback for dev/tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LOCAL_ROOT = path.join(os.tmpdir(), 'aemcontactsheet-store');
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

function isOpenWhiskRuntime() {
  return Boolean(process.env.__OW_API_KEY && !process.env.CONTACTSHEET_LOCAL_STORE);
}

async function getStateClient() {
  if (isOpenWhiskRuntime()) {
    try {
      const sdk = await import('@adobe/aio-sdk');
      const State = sdk.State || sdk.default?.State;
      return await State.init();
    } catch (err) {
      console.error('State.init failed, falling back to Files:', err.message);
    }
  }
  return null;
}

async function getFilesClient() {
  if (isOpenWhiskRuntime()) {
    try {
      const sdk = await import('@adobe/aio-sdk');
      const Files = sdk.Files || sdk.default?.Files;
      return await Files.init();
    } catch (err) {
      console.error('Files.init failed:', err.message);
    }
  }
  return null;
}

function sanitizeStateKey(rawKey) {
  return String(rawKey || '')
    .replace(/[^a-zA-Z0-9-_.]/g, '_')
    .slice(0, 1024);
}

export async function saveJob(job) {
  const updated = { ...job, updatedAt: new Date().toISOString() };
  const state = await getStateClient();
  if (state) {
    try {
      await state.put(sanitizeStateKey(`job.${job.id}`), JSON.stringify(updated), { ttl: SEVEN_DAYS_SEC });
    } catch {
      // Fall through to Files or local disk
    }
  }
  const files = await getFilesClient();
  if (files) {
    try {
      await files.write(`jobs/${job.id}.json`, Buffer.from(JSON.stringify(updated), 'utf8'));
      return updated;
    } catch {
      // Fall through
    }
  }
  const dir = path.join(LOCAL_ROOT, 'state');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${job.id}.json`), JSON.stringify(updated, null, 2));
  return updated;
}

export async function loadJob(jobId) {
  const state = await getStateClient();
  if (state) {
    try {
      const res = await state.get(sanitizeStateKey(`job.${jobId}`));
      if (res?.value) return JSON.parse(res.value);
    } catch {
      // Fall through to Files or local disk
    }
  }
  const files = await getFilesClient();
  if (files) {
    try {
      const buf = await files.read(`jobs/${jobId}.json`);
      if (buf) return JSON.parse(buf.toString('utf8'));
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(path.join(LOCAL_ROOT, 'state', `${jobId}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listRecentJobs(limit = 5, { userHash = '', orgId = '' } = {}) {
  const files = await getFilesClient();
  if (files) {
    try {
      const entries = await files.list('jobs/');
      const genJobs = (entries || [])
        .filter((e) => e.name?.includes('gen_'))
        .sort((a, b) => String(b.lastModified || '').localeCompare(String(a.lastModified || '')))
        .slice(0, Math.max(limit * 4, 20));
      const out = [];
      for (const item of genJobs) {
        if (out.length >= limit) break;
        try {
          const buf = await files.read(item.name);
          if (!buf) continue;
          const parsed = JSON.parse(buf.toString('utf8'));
          if (userHash && parsed.userHash && parsed.userHash !== userHash) continue;
          if (orgId && parsed.orgId && parsed.orgId !== orgId) continue;
          out.push(parsed);
        } catch {
          // ignore
        }
      }
      return out;
    } catch {
      return [];
    }
  }
  return [];
}

export async function writeFileObject(fileKey, data) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  if (typeof data === 'string' && buf.byteLength < 55_000) {
    const state = await getStateClient();
    if (state) {
      try {
        await state.put(sanitizeStateKey(`file.${fileKey}`), data, { ttl: SEVEN_DAYS_SEC });
      } catch {
        // fall through
      }
    }
  }
  const files = await getFilesClient();
  if (files) {
    await files.write(fileKey, buf);
    return fileKey;
  }
  const full = path.join(LOCAL_ROOT, 'files', fileKey);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
  return fileKey;
}

export async function readFileObject(fileKey, asText = true) {
  if (asText) {
    const state = await getStateClient();
    if (state) {
      try {
        const sRes = await state.get(sanitizeStateKey(`file.${fileKey}`));
        if (sRes?.value) return sRes.value;
      } catch {
        // fall through
      }
    }
  }
  const files = await getFilesClient();
  if (files) {
    try {
      const buf = await files.read(fileKey);
      if (buf) return asText ? buf.toString('utf8') : buf;
    } catch {
      // File does not exist in Files yet; fall through
    }
  }
  try {
    const full = path.join(LOCAL_ROOT, 'files', fileKey);
    const buf = await fs.readFile(full);
    return asText ? buf.toString('utf8') : buf;
  } catch {
    return null;
  }
}

export async function getPresignedDownloadUrl(fileKey, expirySeconds = 86400) {
  const files = await getFilesClient();
  if (files && typeof files.generatePresignedURL === 'function') {
    try {
      return await files.generatePresignedURL(fileKey, { expiryInSeconds: expirySeconds, permissions: 'r' });
    } catch {
      return null;
    }
  }
  if (process.env.__OW_API_KEY && !process.env.CONTACTSHEET_LOCAL_STORE) {
    return null;
  }
  return `file://${path.join(LOCAL_ROOT, 'files', fileKey)}`;
}

const PDF_CHUNK_BYTES = 42_000; // ~56 KB base64 per State key (safely under @adobe/aio-lib-state's 64 KB per-key limit!)

export async function savePdfChunks(jobId, pdfBuffer) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.byteLength === 0) return 0;
  const totalChunks = Math.ceil(pdfBuffer.byteLength / PDF_CHUNK_BYTES);
  if (totalChunks > 120) return 0; // cap at ~5 MB in State

  const state = await getStateClient();
  await Promise.all(
    Array.from({ length: totalChunks }, async (_, idx) => {
      const slice = pdfBuffer.subarray(idx * PDF_CHUNK_BYTES, (idx + 1) * PDF_CHUNK_BYTES);
      const b64 = slice.toString('base64');
      if (state) {
        try {
          await state.put(sanitizeStateKey(`pdf.${jobId}.${idx}`), b64, { ttl: 3600 });
          return;
        } catch {
          // fall through
        }
      }
      const dir = path.join(LOCAL_ROOT, 'state');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `pdf_${jobId}_${idx}.b64`), b64);
    })
  );
  return totalChunks;
}

export async function loadPdfChunk(jobId, chunkIdx) {
  const state = await getStateClient();
  if (state) {
    try {
      const res = await state.get(sanitizeStateKey(`pdf.${jobId}.${chunkIdx}`));
      if (res?.value) return res.value;
    } catch {
      // fall through
    }
  }
  try {
    return await fs.readFile(path.join(LOCAL_ROOT, 'state', `pdf_${jobId}_${chunkIdx}.b64`), 'utf8');
  } catch {
    return null;
  }
}
