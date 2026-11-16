// Wrapper around @adobe/aio-lib-state and @adobe/aio-lib-files with automatic local-filesystem fallback for dev/tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LOCAL_ROOT = path.join(os.tmpdir(), 'aemcontactsheet-store');
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

async function getStateClient() {
  if (process.env.AIO_RUNTIME_NAMESPACE && !process.env.CONTACTSHEET_LOCAL_STORE) {
    try {
      const stateLib = await import('@adobe/aio-lib-state');
      const init = stateLib.default?.init || stateLib.init;
      return await init();
    } catch {
      // Fall back to local disk store
    }
  }
  return null;
}

async function getFilesClient() {
  if (process.env.AIO_RUNTIME_NAMESPACE && !process.env.CONTACTSHEET_LOCAL_STORE) {
    try {
      const filesLib = await import('@adobe/aio-lib-files');
      const init = filesLib.default?.init || filesLib.init;
      return await init();
    } catch {
      // Fall back to local disk store
    }
  }
  return null;
}

export async function saveJob(job) {
  const updated = { ...job, updatedAt: new Date().toISOString() };
  const state = await getStateClient();
  if (state) {
    await state.put(`job:${job.id}`, JSON.stringify(updated), { ttl: SEVEN_DAYS_SEC });
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
    const res = await state.get(`job:${jobId}`);
    return res?.value ? JSON.parse(res.value) : null;
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
    return await files.generatePresignedURL(fileKey, { expiryInSeconds: expirySeconds, permissions: 'r' });
  }
  return `file://${path.join(LOCAL_ROOT, 'files', fileKey)}`;
}
