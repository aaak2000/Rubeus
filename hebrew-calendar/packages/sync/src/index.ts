/**
 * @hcal/sync — provider-agnostic calendar synchronization.
 *
 * A {@link SyncEngine} reconciles a local calendar with any {@link CalendarProvider}
 * (Google, Microsoft, CalDAV). ICS files are handled by {@link IcsCodec}.
 */

export { CalDavAdapter, type CalDavConfig } from './adapters/CalDavAdapter.js';
export { GoogleAdapter } from './adapters/GoogleAdapter.js';
export { IcsCodec, icsCodec } from './adapters/IcsCodec.js';
export { MicrosoftAdapter } from './adapters/MicrosoftAdapter.js';
export {
  apiFetch,
  type FetchOptions,
  HttpError,
  isExpiredCursor,
  type TokenSource,
} from './adapters/support.js';
export { hashEvent, SyncEngine, type SyncItemError, type SyncResult } from './SyncEngine.js';
export * from './SyncStore.js';
export * from './types.js';
