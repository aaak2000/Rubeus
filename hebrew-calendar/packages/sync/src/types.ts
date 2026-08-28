/**
 * The provider-neutral ("canonical") event representation used by the sync
 * engine. Each provider adapter converts to/from this shape.
 */
export interface CanonicalEvent {
  /** Stable id within our system (the local event id). */
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** Start instant as an ISO 8601 string (UTC, e.g. 2024-04-23T10:00:00Z). */
  start: string;
  /** End instant as an ISO 8601 string (UTC). */
  end: string;
  /** All-day event flag; when true, start/end are date-only boundaries. */
  allDay?: boolean;
  /** Optional iCalendar RRULE (e.g. "FREQ=YEARLY;INTERVAL=1"). */
  rrule?: string;
  /** Last modification instant (ISO), used for conflict resolution. */
  updatedAt: string;
}

/** A change reported by a provider during incremental sync. */
export interface ProviderChange {
  /** The provider-side event id. */
  providerId: string;
  /** null when the event was deleted upstream. */
  event: CanonicalEvent | null;
  /** Provider concurrency token (etag / changeKey) if available. */
  etag?: string;
}

/** Result of pulling incremental changes from a provider. */
export interface ChangeSet {
  changes: ProviderChange[];
  /** Opaque token to persist and pass back on the next sync. */
  nextToken?: string;
}

/** Reference returned after writing an event to a provider. */
export interface ProviderRef {
  providerId: string;
  etag?: string;
}

/**
 * A calendar provider. Every adapter (Google, Microsoft, CalDAV, ICS)
 * implements this uniform contract so the {@link SyncEngine} is provider
 * agnostic.
 */
export interface CalendarProvider {
  readonly name: string;
  /** Pull changes since `sinceToken` (undefined => full sync). */
  listChanges(sinceToken?: string): Promise<ChangeSet>;
  createEvent(event: CanonicalEvent): Promise<ProviderRef>;
  updateEvent(providerId: string, event: CanonicalEvent, etag?: string): Promise<ProviderRef>;
  deleteEvent(providerId: string, etag?: string): Promise<void>;
}

/** Direction of a sync run. */
export type SyncDirection = 'push' | 'pull' | 'two-way';
