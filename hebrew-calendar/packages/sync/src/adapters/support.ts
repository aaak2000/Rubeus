/** Supplies a fresh OAuth access token (adapters never handle refresh). */
export interface TokenSource {
  getAccessToken(): Promise<string>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 500)}`);
    this.name = 'HttpError';
  }
}

/**
 * True when a provider rejected an incremental cursor as stale (HTTP 410),
 * meaning the caller should discard the token and perform a full sync.
 * Only meaningful on an incremental list — a 410 on a delete means the
 * resource is already gone.
 */
export function isExpiredCursor(err: unknown): boolean {
  return err instanceof HttpError && err.status === 410;
}

export interface FetchOptions extends RequestInit {
  /** Attempts for retryable failures, including the first. Default 4. */
  retries?: number;
  /** Per-attempt timeout in milliseconds. Default 20s. */
  timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRIES = 4;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delay before the next attempt: the server's `Retry-After` when present,
 * otherwise exponential backoff with jitter so parallel clients do not
 * retry in lockstep.
 */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_BACKOFF_MS);
  }
  const base = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
  return base / 2 + Math.random() * (base / 2);
}

/**
 * JSON fetch with bearer auth, a per-attempt timeout, and retries with
 * exponential backoff on rate limits and transient server errors.
 *
 * Providers throttle aggressively (Google and Microsoft Graph both return 429
 * under load), so a sync without backoff fails as soon as a calendar is large.
 */
export async function apiFetch<T>(
  url: string,
  token: string,
  init: FetchOptions = {},
): Promise<{ data: T; etag?: string; status: number }> {
  const { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = init;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...requestInit,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(requestInit.headers ?? {}),
        },
      });

      if (RETRYABLE_STATUS.has(res.status) && attempt < retries - 1) {
        const wait = backoffMs(attempt, res.headers.get('retry-after'));
        await res.text().catch(() => undefined);
        await sleep(wait);
        continue;
      }

      const etag = res.headers.get('etag') ?? undefined;
      if (res.status === 204) return { data: undefined as T, etag, status: 204 };

      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, url, text);
      const data = text ? (JSON.parse(text) as T) : (undefined as T);
      return { data, etag, status: res.status };
    } catch (err) {
      // Definitive answers from the server must not be retried.
      if (err instanceof HttpError) throw err;
      lastError = err;
      if (attempt < retries - 1) await sleep(backoffMs(attempt, null));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request to ${url} failed`);
}
