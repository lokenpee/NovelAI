export class ApiRequestError extends Error {
  constructor(message, { status = 0, retryAfterMs = 0, raw = null } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.raw = raw;
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.message === 'Aborted';
}

export function isRetryableError(error) {
  if (isAbortError(error)) return false;
  const status = Number(error?.status || 0);
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || status === 0;
}

export function getRetryAfterMs(headers) {
  const value = headers?.get?.('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : 0;
}

export async function withRateLimitRetry(task, { retries = 3, baseDelayMs = 800, maxDelayMs = 10000, signal, onRetry = () => {} } = {}) {
  const attempts = Math.max(0, Number(retries) || 0);
  let lastError;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try { return await task(attempt); } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableError(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const retryAfter = Number(error?.retryAfterMs || 0);
      const delay = Math.max(exponential, retryAfter) + Math.floor(Math.random() * 250);
      onRetry(error, attempt + 1, delay);
      await wait(delay, signal);
    }
  }
  throw lastError;
}

export function wait(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timeout = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, delayMs);
    const onAbort = () => { clearTimeout(timeout); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
