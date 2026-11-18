// Shared HTTP response, authentication header extraction, SSRF host validation, and concurrency helpers.
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
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isProdOpenWhisk() {
  return Boolean(process.env.__OW_API_KEY && !process.env.CONTACTSHEET_LOCAL_STORE);
}

export function extractAuth(params = {}) {
  const headers = params.__ow_headers || {};
  const rawAuth = headers.authorization || headers.Authorization || params.accessToken || '';
  const bearerToken = rawAuth.replace(/^Bearer\s+/i, '').trim();
  const claims = decodeJwtPayload(bearerToken);
  const hasJwtIdentity = Boolean(claims && (claims.org || claims.user_id || claims.sub));
  const isProd = isProdOpenWhisk();

  // Never allow query/body params (`params.imsOrg`, `params.userId`, `params.userHash`)
  // to override a JWT token's claims or impersonate another user.
  const imsOrg = hasJwtIdentity
    ? claims.org || headers['x-gw-ims-org-id'] || ''
    : headers['x-gw-ims-org-id'] ||
      (!isProd ? params.imsOrg : '') ||
      params.DEFAULT_IMS_ORG ||
      (!isProd ? 'TEST_ORG@AdobeOrg' : '');

  const userId = hasJwtIdentity
    ? claims.user_id || claims.sub || claims.email || headers['x-ims-user-id'] || 'anonymous'
    : headers['x-ims-user-id'] || (!isProd ? params.userId : '') || 'anonymous';

  const userEmail = hasJwtIdentity
    ? claims.email || (!isProd ? params.userEmail : '') || userId
    : (!isProd ? params.userEmail : '') || userId;

  const rawApiKey = headers['x-api-key'] || params.apiKey || '';
  const apiKey =
    !rawApiKey || rawApiKey === 'exc_app' || rawApiKey === 'UnifiedShell'
      ? 'aem-assets-frontend-1'
      : rawApiKey;

  // Always compute userHash server-side from (imsOrg, userId); never trust caller-supplied params.userHash.
  const userHash = crypto
    .createHash('sha256')
    .update(`${imsOrg}:${userId}`)
    .digest('hex')
    .slice(0, 24);

  return {
    bearerToken,
    imsOrg,
    apiKey,
    userId,
    userEmail,
    userHash,
  };
}

const ALLOWED_AEM_DOMAIN_RE = /^([a-z0-9-]+)\.(adobeaemcloud\.com|adobecqms\.net)$/i;

/**
 * Validate and normalize an AEM Author or Delivery base URL to prevent SSRF / bearer-token leakage.
 * Only `https://*.adobeaemcloud.com`, `https://*.adobecqms.net`, or hosts in `ALLOWED_AEM_HOSTS` are permitted.
 */
export function validateAemHost(rawHost, { allowedHosts = process.env.ALLOWED_AEM_HOSTS || '' } = {}) {
  const trimmed = String(rawHost || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    const err = new Error(`Invalid AEM host URL: "${rawHost}"`);
    err.statusCode = 400;
    err.code = 'INVALID_AEM_HOST';
    err.retryable = false;
    throw err;
  }

  const extraAllowed = new Set(
    String(allowedHosts || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
  const hostLower = parsed.hostname.toLowerCase();
  const isAllowedDomain = ALLOWED_AEM_DOMAIN_RE.test(hostLower) || extraAllowed.has(hostLower);

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash ||
    !isAllowedDomain
  ) {
    const err = new Error(
      `Disallowed AEM host "${parsed.hostname}". Only https://*.adobeaemcloud.com hosts are permitted.`
    );
    err.statusCode = 400;
    err.code = 'INVALID_AEM_HOST';
    err.retryable = false;
    throw err;
  }

  return `https://${hostLower}`;
}

export function deriveCounterpartAemHost(hostUrl, targetPrefix) {
  if (!hostUrl) return '';
  return hostUrl.replace(
    /^https:\/\/(author|delivery|publish)(-p\d+-e\d+\.adobeaemcloud\.com)$/i,
    `https://${targetPrefix}$2`
  );
}

function cleanHostParam(val) {
  const s = String(val || '').trim();
  return s && !s.startsWith('$') ? s : '';
}

/**
 * Validate and resolve `{ aemHost, deliveryHost }` from request params, model, or environment defaults,
 * automatically deriving the paired Author/Delivery host (`author-pX-eY` <-> `delivery-pX-eY`) for multi-tenant installs.
 */
export function resolveAemHosts(params = {}, model = null) {
  const allowedHosts = cleanHostParam(params.ALLOWED_AEM_HOSTS) || process.env.ALLOWED_AEM_HOSTS || '';
  const rawAem =
    cleanHostParam(params.aemHost) ||
    cleanHostParam(model?.aemHost) ||
    cleanHostParam(params.DEFAULT_AEM_HOST) ||
    cleanHostParam(process.env.DEFAULT_AEM_HOST);
  const rawDelivery =
    cleanHostParam(params.deliveryHost) ||
    cleanHostParam(model?.deliveryHost) ||
    cleanHostParam(params.DEFAULT_DELIVERY_HOST) ||
    cleanHostParam(process.env.DEFAULT_DELIVERY_HOST);

  let aemHost = rawAem ? validateAemHost(rawAem, { allowedHosts }) : '';
  let deliveryHost = rawDelivery ? validateAemHost(rawDelivery, { allowedHosts }) : '';

  // If Content Hub passed a `delivery-p...` host in `aemHost`, promote it to `deliveryHost` and derive `author-p...`
  if (aemHost && /^https:\/\/delivery-p\d+-e\d+\.adobeaemcloud\.com$/i.test(aemHost)) {
    if (!deliveryHost) deliveryHost = aemHost;
    aemHost = deriveCounterpartAemHost(aemHost, 'author');
  }

  if (aemHost && !deliveryHost) {
    deliveryHost = deriveCounterpartAemHost(aemHost, 'delivery') || aemHost;
  } else if (deliveryHost && !aemHost) {
    aemHost = deriveCounterpartAemHost(deliveryHost, 'author') || deliveryHost;
  }

  if (!aemHost && !deliveryHost) {
    if (isProdOpenWhisk()) {
      const err = new Error(
        'Missing AEM host URL. Open the extension from AEM Assets View or Content Hub, or configure DEFAULT_AEM_HOST.'
      );
      err.statusCode = 400;
      err.code = 'MISSING_AEM_HOST';
      err.retryable = false;
      throw err;
    }
    aemHost = 'https://author-p00000-e000000.adobeaemcloud.com';
    deliveryHost = 'https://delivery-p00000-e000000.adobeaemcloud.com';
  }

  return { aemHost, deliveryHost };
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
