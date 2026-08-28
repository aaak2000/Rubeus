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

/** Minimal JSON fetch wrapper with bearer auth and error surfacing. */
export async function apiFetch<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<{ data: T; etag?: string; status: number }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const etag = res.headers.get('etag') ?? undefined;
  if (res.status === 204) return { data: undefined as T, etag, status: 204 };
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, url, text);
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  return { data, etag, status: res.status };
}
