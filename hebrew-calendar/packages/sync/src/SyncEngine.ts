import type { SyncMappingRecord, SyncStore } from './SyncStore.js';
import type { CalendarProvider, CanonicalEvent, SyncDirection } from './types.js';

export interface SyncResult {
  pulledCreated: number;
  pulledUpdated: number;
  pulledDeleted: number;
  pushedCreated: number;
  pushedUpdated: number;
  pushedDeleted: number;
  conflicts: number;
  /** Per-item failures that did not abort the run. */
  errors: SyncItemError[];
}

export interface SyncItemError {
  phase: 'pull' | 'push';
  /** The local or provider id the failure relates to, when known. */
  id?: string;
  message: string;
}

function emptyResult(): SyncResult {
  return {
    pulledCreated: 0,
    pulledUpdated: 0,
    pulledDeleted: 0,
    pushedCreated: 0,
    pushedUpdated: 0,
    pushedDeleted: 0,
    conflicts: 0,
    errors: [],
  };
}

/** Stable content hash of the syncable fields of an event (loop guard). */
export function hashEvent(e: CanonicalEvent): string {
  const canonical = JSON.stringify([
    e.title,
    e.description ?? '',
    e.location ?? '',
    e.start,
    e.end,
    e.allDay ?? false,
    e.rrule ?? '',
  ]);
  // djb2 — small, deterministic, dependency-free.
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h + canonical.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reconciles a local calendar with a single external provider.
 *
 * Strategy: incremental **pull** then **push**, last-write-wins by
 * `updatedAt`, with a per-mapping content hash to avoid echoing a change back
 * to the side it came from (sync loops).
 *
 * A failure on one item is recorded in {@link SyncResult.errors} and the run
 * continues: one malformed event upstream must not block every other change.
 */
export class SyncEngine {
  constructor(
    private readonly store: SyncStore,
    private readonly provider: CalendarProvider,
  ) {}

  async sync(direction: SyncDirection = 'two-way'): Promise<SyncResult> {
    const result = emptyResult();
    if (direction === 'pull' || direction === 'two-way') await this.pull(result);
    if (direction === 'push' || direction === 'two-way') await this.push(result);
    return result;
  }

  private async pull(result: SyncResult): Promise<void> {
    const token = await this.store.getSyncToken();
    const { changes, nextToken } = await this.provider.listChanges(token);
    const mappingsByProvider = index(await this.store.listMappings(), (m) => m.providerId);
    // Read local state once: re-reading per change turns a sync into O(n²)
    // queries against the database.
    const localsByUid = index(await this.store.listLocalEvents(), (e) => e.uid);

    for (const change of changes) {
      try {
        const existing = mappingsByProvider.get(change.providerId);

        if (change.event === null) {
          if (existing) {
            await this.store.deleteLocalEvent(existing.localUid);
            await this.store.deleteMapping(existing.localUid);
            localsByUid.delete(existing.localUid);
            result.pulledDeleted++;
          }
          continue;
        }

        const incoming = change.event;
        if (existing) {
          const local = localsByUid.get(existing.localUid);
          // Conflict: both sides changed since the last sync. Newest wins.
          if (local && hashEvent(local) !== existing.lastSyncedHash) {
            result.conflicts++;
            if (Date.parse(local.updatedAt) >= Date.parse(incoming.updatedAt)) {
              continue; // keep local; the push phase sends it upstream
            }
          }
          const merged: CanonicalEvent = { ...incoming, uid: existing.localUid };
          await this.store.upsertLocalEvent(merged);
          await this.store.saveMapping({
            localUid: existing.localUid,
            providerId: change.providerId,
            etag: change.etag,
            lastSyncedHash: hashEvent(merged),
          });
          localsByUid.set(merged.uid, merged);
          result.pulledUpdated++;
        } else {
          await this.store.upsertLocalEvent(incoming);
          await this.store.saveMapping({
            localUid: incoming.uid,
            providerId: change.providerId,
            etag: change.etag,
            lastSyncedHash: hashEvent(incoming),
          });
          localsByUid.set(incoming.uid, incoming);
          result.pulledCreated++;
        }
      } catch (err) {
        result.errors.push({ phase: 'pull', id: change.providerId, message: message(err) });
      }
    }

    // Only advance the cursor when the provider supplied a new one; clearing it
    // would force a full resync on every subsequent run.
    if (nextToken) await this.store.saveSyncToken(nextToken);
  }

  private async push(result: SyncResult): Promise<void> {
    const locals = await this.store.listLocalEvents();
    const localByUid = index(locals, (e) => e.uid);
    const mappings = await this.store.listMappings();
    const mappingByLocal = index(mappings, (m) => m.localUid);

    // Creates & updates.
    for (const local of locals) {
      try {
        const mapping = mappingByLocal.get(local.uid);
        const hash = hashEvent(local);
        if (!mapping) {
          const ref = await this.provider.createEvent(local);
          await this.store.saveMapping({
            localUid: local.uid,
            providerId: ref.providerId,
            etag: ref.etag,
            lastSyncedHash: hash,
          });
          result.pushedCreated++;
        } else if (mapping.lastSyncedHash !== hash) {
          const ref = await this.provider.updateEvent(mapping.providerId, local, mapping.etag);
          await this.store.saveMapping({
            localUid: local.uid,
            providerId: ref.providerId,
            etag: ref.etag,
            lastSyncedHash: hash,
          });
          result.pushedUpdated++;
        }
      } catch (err) {
        result.errors.push({ phase: 'push', id: local.uid, message: message(err) });
      }
    }

    // Deletes: mappings whose local event no longer exists.
    for (const mapping of mappings) {
      if (localByUid.has(mapping.localUid)) continue;
      try {
        await this.provider.deleteEvent(mapping.providerId, mapping.etag);
      } catch (err) {
        // Already gone upstream is the desired end state, not a failure.
        if (!isAlreadyGone(err)) {
          result.errors.push({ phase: 'push', id: mapping.localUid, message: message(err) });
          continue;
        }
      }
      await this.store.deleteMapping(mapping.localUid);
      result.pushedDeleted++;
    }
  }
}

/** True for provider errors meaning the resource no longer exists. */
function isAlreadyGone(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 404 || status === 410;
}

function index<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

export type { SyncMappingRecord };
