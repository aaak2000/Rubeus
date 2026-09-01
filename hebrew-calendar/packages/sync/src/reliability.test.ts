import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, HttpError, isExpiredCursor } from './adapters/support.js';
import { SyncEngine } from './SyncEngine.js';
import type { SyncMappingRecord, SyncStore } from './SyncStore.js';
import type { CalendarProvider, CanonicalEvent, ChangeSet, ProviderRef } from './types.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('apiFetch — resilience', () => {
  it('retries a 429 and succeeds, honouring Retry-After', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async () => {
      calls.push('call');
      if (calls.length === 1) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
      }
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const { data } = await apiFetch<{ ok: boolean }>('https://example.test/x', 'tok');
    expect(data.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('retries transient 5xx then gives up with the last status', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('boom', { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('https://example.test/x', 'tok', { retries: 2 })).rejects.toThrow(
      /HTTP 503/,
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a definitive 4xx', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('nope', { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('https://example.test/x', 'tok')).rejects.toThrow(/HTTP 400/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('identifies an expired incremental cursor (410)', () => {
    expect(isExpiredCursor(new HttpError(410, 'u', ''))).toBe(true);
    expect(isExpiredCursor(new HttpError(404, 'u', ''))).toBe(false);
    expect(isExpiredCursor(new Error('other'))).toBe(false);
  });
});

// --- engine robustness ---

class MemoryStore implements SyncStore {
  events = new Map<string, CanonicalEvent>();
  mappings = new Map<string, SyncMappingRecord>();
  token: string | undefined;
  listLocalCalls = 0;

  async listLocalEvents() {
    this.listLocalCalls++;
    return [...this.events.values()];
  }
  async upsertLocalEvent(e: CanonicalEvent) {
    this.events.set(e.uid, e);
  }
  async deleteLocalEvent(uid: string) {
    this.events.delete(uid);
  }
  async listMappings() {
    return [...this.mappings.values()];
  }
  async saveMapping(m: SyncMappingRecord) {
    this.mappings.set(m.localUid, m);
  }
  async deleteMapping(uid: string) {
    this.mappings.delete(uid);
  }
  async getSyncToken() {
    return this.token;
  }
  async saveSyncToken(t: string | undefined) {
    this.token = t;
  }
}

function mkEvent(uid: string, over: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    uid,
    title: `Event ${uid}`,
    start: '2024-06-01T09:00:00Z',
    end: '2024-06-01T10:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    ...over,
  };
}

class ScriptedProvider implements CalendarProvider {
  readonly name = 'scripted';
  deleted: string[] = [];
  constructor(
    private readonly changes: ChangeSet,
    private readonly hooks: Partial<Pick<CalendarProvider, 'createEvent' | 'deleteEvent'>> = {},
  ) {}
  async listChanges(): Promise<ChangeSet> {
    return this.changes;
  }
  async createEvent(e: CanonicalEvent): Promise<ProviderRef> {
    if (this.hooks.createEvent) return this.hooks.createEvent(e);
    return { providerId: `remote-${e.uid}` };
  }
  async updateEvent(providerId: string): Promise<ProviderRef> {
    return { providerId };
  }
  async deleteEvent(providerId: string, etag?: string): Promise<void> {
    if (this.hooks.deleteEvent) return this.hooks.deleteEvent(providerId, etag);
    this.deleted.push(providerId);
  }
}

describe('SyncEngine — robustness', () => {
  it('reads local events once per phase rather than once per change', async () => {
    const store = new MemoryStore();
    const changes = Array.from({ length: 25 }, (_, i) => ({
      providerId: `r${i}`,
      event: mkEvent(`r${i}`),
    }));
    const engine = new SyncEngine(store, new ScriptedProvider({ changes, nextToken: 't' }));
    await engine.sync('pull');
    // One read for the whole pull phase, regardless of change count.
    expect(store.listLocalCalls).toBe(1);
    expect(store.events.size).toBe(25);
  });

  it('keeps the previous cursor when the provider returns none', async () => {
    const store = new MemoryStore();
    store.token = 'existing-token';
    const engine = new SyncEngine(
      store,
      new ScriptedProvider({ changes: [], nextToken: undefined }),
    );
    await engine.sync('pull');
    expect(store.token).toBe('existing-token');
  });

  it('records a failing item and still processes the rest', async () => {
    const store = new MemoryStore();
    await store.upsertLocalEvent(mkEvent('good'));
    await store.upsertLocalEvent(mkEvent('bad'));
    const provider = new ScriptedProvider(
      { changes: [], nextToken: 't' },
      {
        createEvent: async (e) => {
          if (e.uid === 'bad') throw new Error('provider rejected the event');
          return { providerId: `remote-${e.uid}` };
        },
      },
    );
    const result = await new SyncEngine(store, provider).sync('push');
    expect(result.pushedCreated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ phase: 'push', id: 'bad' });
    expect(store.mappings.has('good')).toBe(true);
  });

  it('treats an already-deleted remote event as success', async () => {
    const store = new MemoryStore();
    await store.saveMapping({ localUid: 'gone', providerId: 'remote-gone' });
    const provider = new ScriptedProvider(
      { changes: [], nextToken: 't' },
      {
        deleteEvent: async () => {
          throw new HttpError(404, 'u', 'not found');
        },
      },
    );
    const result = await new SyncEngine(store, provider).sync('push');
    expect(result.pushedDeleted).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(store.mappings.has('gone')).toBe(false);
  });
});
