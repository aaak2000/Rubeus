import { describe, expect, it } from 'vitest';
import { SyncEngine, hashEvent } from './SyncEngine.js';
import type { SyncMappingRecord, SyncStore } from './SyncStore.js';
import type { CalendarProvider, CanonicalEvent, ChangeSet, ProviderRef } from './types.js';

/** In-memory store for testing reconciliation. */
class MemoryStore implements SyncStore {
  events = new Map<string, CanonicalEvent>();
  mappings = new Map<string, SyncMappingRecord>();
  token: string | undefined;

  async listLocalEvents() {
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

/** Fake provider recording writes and replaying scripted pulls. */
class FakeProvider implements CalendarProvider {
  readonly name = 'fake';
  created: CanonicalEvent[] = [];
  updated: CanonicalEvent[] = [];
  deleted: string[] = [];
  remote = new Map<string, CanonicalEvent>();
  pending: ChangeSet = { changes: [], nextToken: 'tok-1' };

  async listChanges(): Promise<ChangeSet> {
    const cs = this.pending;
    this.pending = { changes: [], nextToken: cs.nextToken };
    return cs;
  }
  async createEvent(e: CanonicalEvent): Promise<ProviderRef> {
    this.created.push(e);
    const id = `remote-${e.uid}`;
    this.remote.set(id, e);
    return { providerId: id, etag: 'e1' };
  }
  async updateEvent(providerId: string, e: CanonicalEvent): Promise<ProviderRef> {
    this.updated.push(e);
    this.remote.set(providerId, e);
    return { providerId, etag: 'e2' };
  }
  async deleteEvent(providerId: string): Promise<void> {
    this.deleted.push(providerId);
    this.remote.delete(providerId);
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

describe('SyncEngine', () => {
  it('pushes new local events to the provider and records mappings', async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    await store.upsertLocalEvent(mkEvent('a'));
    const res = await new SyncEngine(store, provider).sync('push');
    expect(res.pushedCreated).toBe(1);
    expect(provider.created).toHaveLength(1);
    expect(store.mappings.get('a')?.providerId).toBe('remote-a');
  });

  it('pulls new provider events into the local store', async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    provider.pending = {
      changes: [{ providerId: 'r1', event: mkEvent('r1'), etag: 'x' }],
      nextToken: 'tok-2',
    };
    const res = await new SyncEngine(store, provider).sync('pull');
    expect(res.pulledCreated).toBe(1);
    expect(store.events.has('r1')).toBe(true);
    expect(store.token).toBe('tok-2');
  });

  it('does not echo a pulled event back on the next push (loop guard)', async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    provider.pending = { changes: [{ providerId: 'r1', event: mkEvent('r1') }], nextToken: 't' };
    await new SyncEngine(store, provider).sync('two-way');
    expect(provider.created).toHaveLength(0); // pulled event must not be re-created
    expect(provider.updated).toHaveLength(0);
  });

  it('propagates a local deletion as a provider delete', async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    await store.upsertLocalEvent(mkEvent('a'));
    await new SyncEngine(store, provider).sync('push'); // create mapping
    store.events.delete('a'); // user deletes locally
    const res = await new SyncEngine(store, provider).sync('push');
    expect(res.pushedDeleted).toBe(1);
    expect(provider.deleted).toContain('remote-a');
    expect(store.mappings.has('a')).toBe(false);
  });

  it('resolves conflicts by newest updatedAt (local newer wins)', async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    const local = mkEvent('a', { title: 'local-new', updatedAt: '2024-06-10T00:00:00Z' });
    await store.upsertLocalEvent(local);
    await store.saveMapping({ localUid: 'a', providerId: 'remote-a', lastSyncedHash: 'stale' });
    provider.pending = {
      changes: [{ providerId: 'remote-a', event: mkEvent('a', { title: 'remote-old', updatedAt: '2024-06-05T00:00:00Z' }) }],
      nextToken: 't',
    };
    const res = await new SyncEngine(store, provider).sync('two-way');
    expect(res.conflicts).toBe(1);
    expect(store.events.get('a')?.title).toBe('local-new'); // local kept
    expect(provider.updated.some((e) => e.title === 'local-new')).toBe(true); // pushed upstream
  });

  it('hashEvent is stable and content-sensitive', () => {
    const e = mkEvent('a');
    expect(hashEvent(e)).toBe(hashEvent({ ...e }));
    expect(hashEvent(e)).not.toBe(hashEvent({ ...e, title: 'changed' }));
  });
});
