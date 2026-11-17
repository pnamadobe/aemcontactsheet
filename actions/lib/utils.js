// Shared HTTP response, authentication header extraction, and concurrency helpers.
import crypto from 'node:crypto';

export function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  };
}

export function errorResponse(statusCode, code, message, retryable = false) {
  return jsonResponse(statusCode, {
    error: { code, message, retryable },
  });
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function extractAuth(params = {}) {
  const headers = params.__ow_headers || {};
  const rawAuth = headers.authorization || headers.Authorization || params.accessToken || '';
  const bearerToken = rawAuth.replace(/^Bearer\s+/i, '').trim();
  const claims = decodeJwtPayload(bearerToken) || {};
  const imsOrg = headers['x-gw-ims-org-id'] || params.imsOrg || claims.org || '4A603BC061E191130A495FEF@AdobeOrg';
  const rawApiKey = headers['x-api-key'] || params.apiKey || '';
  const apiKey =
    !rawApiKey || rawApiKey === 'exc_app' || rawApiKey === 'UnifiedShell'
      ? 'aem-assets-frontend-1'
      : rawApiKey;
  const userId = claims.user_id || claims.sub || params.userId || headers['x-ims-user-id'] || 'anonymous';
  const userEmail = params.userEmail || claims.email || userId;
  return {
    bearerToken,
    imsOrg,
    apiKey,
    userId,
    userEmail,
    userHash:
      params.userHash
      || crypto.createHash('sha256').update(`${imsOrg}:${userId}`).digest('hex').slice(0, 24),
  };
}

export function newJobId(prefix = 'job') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

/** Run async tasks over `items` with bounded concurrency. */
export async function mapWithConcurrency(items, concurrency, fn, onProgress = null) {
  const results = new Array(items.length);
  let nextIdx = 0;
  let completed = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      results[i] = await fn(items[i], i);
      completed++;
      if (onProgress) {
        await onProgress(completed, items.length);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Retry an async operation with exponential backoff + jitter on 429/5xx or transient errors. */
export async function withRetry(fn, { retries = 3, baseDelayMs = 350 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const retryable = err?.retryable !== false && (!err?.status || err.status === 429 || err.status >= 500);
      if (!retryable || attempt === retries) break;
      const jitter = Math.floor(Math.random() * 150);
      const wait = baseDelayMs * Math.pow(2, attempt) + jitter;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
