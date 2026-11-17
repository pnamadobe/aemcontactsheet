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

export async function saveJob(job) {
  const updated = { ...job, updatedAt: new Date().toISOString() };
  const state = await getStateClient();
  if (state) {
    try {
      await state.put(`job:${job.id}`, JSON.stringify(updated), { ttl: SEVEN_DAYS_SEC });
      return updated;
    } catch {
      // Fall through to Files or local disk
    }
  }
  const files = await getFilesClient();
  if (files) {
    await files.write(`jobs/${job.id}.json`, Buffer.from(JSON.stringify(updated), 'utf8'));
    return updated;
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
      const res = await state.get(`job:${jobId}`);
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

export async function writeFileObject(fileKey, data) {
  const files = await getFilesClient();
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
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
  const files = await getFilesClient();
  if (files) {
    const buf = await files.read(fileKey);
    return asText ? buf.toString('utf8') : buf;
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

const PDF_CHUNK_BYTES = 600_000; // ~800 KB base64 per State key (well under State's 1 MB per-key limit)

export async function savePdfChunks(jobId, pdfBuffer) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.byteLength === 0) return 0;
  const totalChunks = Math.ceil(pdfBuffer.byteLength / PDF_CHUNK_BYTES);
  if (totalChunks > 24) return 0; // cap at ~14.4 MB in State

  const state = await getStateClient();
  await Promise.all(
    Array.from({ length: totalChunks }, async (_, idx) => {
      const slice = pdfBuffer.subarray(idx * PDF_CHUNK_BYTES, (idx + 1) * PDF_CHUNK_BYTES);
      const b64 = slice.toString('base64');
      if (state) {
        try {
          await state.put(`pdf:${jobId}:${idx}`, b64, { ttl: 3600 });
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
      const res = await state.get(`pdf:${jobId}:${chunkIdx}`);
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
