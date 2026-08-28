import type { CanonicalEvent } from './types.js';

/** A persisted mapping between one local event and its provider counterpart. */
export interface SyncMappingRecord {
  localUid: string;
  providerId: string;
  etag?: string;
  /** Content hash at the moment of the last successful sync (loop guard). */
  lastSyncedHash?: string;
}

/**
 * Persistence port the {@link SyncEngine} depends on. The API package
 * implements this over Prisma (Event / SyncMapping / SyncState tables); tests
 * implement it in memory.
 */
export interface SyncStore {
  /** All local events belonging to the calendar being synced. */
  listLocalEvents(): Promise<CanonicalEvent[]>;
  /** Create or update a local event from an incoming provider change. */
  upsertLocalEvent(event: CanonicalEvent): Promise<void>;
  /** Remove a local event (because it was deleted upstream). */
  deleteLocalEvent(localUid: string): Promise<void>;

  listMappings(): Promise<SyncMappingRecord[]>;
  saveMapping(record: SyncMappingRecord): Promise<void>;
  deleteMapping(localUid: string): Promise<void>;

  /** Opaque incremental-sync token for this provider/calendar. */
  getSyncToken(): Promise<string | undefined>;
  saveSyncToken(token: string | undefined): Promise<void>;
}
