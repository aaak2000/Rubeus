import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Concurrent 401s must produce exactly one token rotation.
 *
 * Refresh tokens rotate on use, and the server treats a reused one as a leak
 * by revoking the whole session family. A page load fires several requests at
 * once; if each answered its own 401 by spending the same refresh token, the
 * second would log the user out — which is precisely what happened before the
 * refresh was made single-flight.
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.resetModules();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('token refresh', () => {
  it('rotates once when several requests get a 401 together', async () => {
    let refreshCalls = 0;
    let currentRefresh = 'refresh-1';

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        const body = JSON.parse(String(init?.body)) as { refreshToken: string };
        // The server rotates: a token that is not the current one is a reuse,
        // and the session family is revoked.
        if (body.refreshToken !== currentRefresh) {
          return new Response('{"message":"revoked"}', { status: 401 });
        }
        currentRefresh = `refresh-${refreshCalls + 1}`;
        return new Response(
          JSON.stringify({ accessToken: `access-${refreshCalls + 1}`, refreshToken: currentRefresh }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // Protected endpoints reject the original access token, accept a rotated one.
      const authHeader = new Headers(init?.headers).get('Authorization');
      if (authHeader === 'Bearer access-1') {
        return new Response('{"message":"expired"}', { status: 401 });
      }
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { api, tokenStore } = await import('./client');
    tokenStore.set('access-1', 'refresh-1');

    // Three calls in flight at once, exactly as a page load makes them.
    const results = await Promise.all([api.profile(), api.calendars(), api.billingStatus()]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    // Every request succeeded, and the session survived.
    expect(tokenStore.access).toBe('access-2');
  });

  it('can refresh again after an earlier refresh settled', async () => {
    let refreshCalls = 0;
    const spent = new Set<string>(['stale']);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        return new Response(
          JSON.stringify({ accessToken: `a${refreshCalls}`, refreshToken: `r${refreshCalls}` }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const authHeader = new Headers(init?.headers).get('Authorization');
      // Every access token works exactly once, so the second round has to
      // rotate again rather than reuse the first round's result.
      const token = authHeader?.replace('Bearer ', '') ?? '';
      if (spent.has(token)) return new Response('{}', { status: 401 });
      spent.add(token);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { api, tokenStore } = await import('./client');
    tokenStore.set('stale', 'r0');

    await api.profile();
    await api.profile();
    // The in-flight promise is cleared once settled, so the second round can
    // rotate again rather than reusing a spent result.
    expect(refreshCalls).toBe(2);
  });
});
