/**
 * @hcal/sync — provider-agnostic calendar synchronization.
 *
 * A {@link SyncEngine} reconciles a local calendar with any {@link CalendarProvider}
 * (Google, Microsoft, CalDAV). ICS files are handled by {@link IcsCodec}.
 */
export * from './types.js';
export * from './SyncStore.js';
export { SyncEngine, hashEvent, type SyncResult, type SyncItemError } from './SyncEngine.js';
export { IcsCodec, icsCodec } from './adapters/IcsCodec.js';
export { GoogleAdapter } from './adapters/GoogleAdapter.js';
export { MicrosoftAdapter } from './adapters/MicrosoftAdapter.js';
export { CalDavAdapter, type CalDavConfig } from './adapters/CalDavAdapter.js';
export { type TokenSource, type FetchOptions, HttpError, isExpiredCursor, apiFetch } from './adapters/support.js';
