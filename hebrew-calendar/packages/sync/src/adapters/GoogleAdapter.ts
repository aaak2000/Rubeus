import type { CalendarProvider, CanonicalEvent, ChangeSet, ProviderRef } from '../types.js';
import { apiFetch, isExpiredCursor, type TokenSource } from './support.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

interface GoogleTime {
  date?: string; // all-day (YYYY-MM-DD)
  dateTime?: string; // RFC3339
  timeZone?: string;
}
interface GoogleEvent {
  id: string;
  status?: string; // 'confirmed' | 'cancelled'
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurrence?: string[];
  updated?: string;
  etag?: string;
}
interface GoogleListResponse {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

function fromGoogle(g: GoogleEvent): CanonicalEvent {
  const allDay = Boolean(g.start?.date);
  const start = g.start?.dateTime ?? (g.start?.date ? `${g.start.date}T00:00:00Z` : '');
  const end = g.end?.dateTime ?? (g.end?.date ? `${g.end.date}T00:00:00Z` : '');
  const rrule = g.recurrence?.find((r) => r.startsWith('RRULE:'))?.slice('RRULE:'.length);
  const ev: CanonicalEvent = {
    uid: g.id,
    title: g.summary ?? '',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay,
    updatedAt: g.updated ?? new Date().toISOString(),
  };
  if (g.description) ev.description = g.description;
  if (g.location) ev.location = g.location;
  if (rrule) ev.rrule = rrule;
  return ev;
}

function toGoogle(e: CanonicalEvent): Partial<GoogleEvent> {
  const body: Partial<GoogleEvent> = {
    summary: e.title,
    description: e.description,
    location: e.location,
  };
  if (e.allDay) {
    body.start = { date: e.start.slice(0, 10) };
    body.end = { date: e.end.slice(0, 10) };
  } else {
    body.start = { dateTime: e.start };
    body.end = { dateTime: e.end };
  }
  if (e.rrule) body.recurrence = [`RRULE:${e.rrule}`];
  return body;
}

/** Google Calendar API v3 adapter with incremental `syncToken` support. */
export class GoogleAdapter implements CalendarProvider {
  readonly name = 'google';

  constructor(
    private readonly tokens: TokenSource,
    private readonly calendarId = 'primary',
  ) {}

  private path(suffix = ''): string {
    return `${BASE}/calendars/${encodeURIComponent(this.calendarId)}/events${suffix}`;
  }

  /**
   * Pull changes since `sinceToken`.
   *
   * Google expires sync tokens (after a retention window, or when the calendar
   * changes in ways it cannot express incrementally) and answers 410 Gone. The
   * documented recovery is to discard the token and resync in full, which is
   * done transparently here — otherwise the calendar would stay broken forever.
   */
  async listChanges(sinceToken?: string): Promise<ChangeSet> {
    if (!sinceToken) return this.fetchChanges(undefined);
    try {
      return await this.fetchChanges(sinceToken);
    } catch (err) {
      if (!isExpiredCursor(err)) throw err;
      return this.fetchChanges(undefined);
    }
  }

  private async fetchChanges(sinceToken: string | undefined): Promise<ChangeSet> {
    const token = await this.tokens.getAccessToken();
    const changes: ChangeSet['changes'] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const params = new URLSearchParams({
        showDeleted: 'true',
        singleEvents: 'false',
        maxResults: '250',
      });
      if (sinceToken) params.set('syncToken', sinceToken);
      else params.set('timeMin', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString());
      if (pageToken) params.set('pageToken', pageToken);
      const { data } = await apiFetch<GoogleListResponse>(`${this.path()}?${params}`, token);
      for (const item of data.items ?? []) {
        if (item.status === 'cancelled') {
          changes.push({ providerId: item.id, event: null });
        } else {
          changes.push({ providerId: item.id, event: fromGoogle(item), etag: item.etag });
        }
      }
      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { changes, nextToken: nextSyncToken };
  }

  async createEvent(event: CanonicalEvent): Promise<ProviderRef> {
    const token = await this.tokens.getAccessToken();
    const { data } = await apiFetch<GoogleEvent>(this.path(), token, {
      method: 'POST',
      body: JSON.stringify(toGoogle(event)),
    });
    return { providerId: data.id, etag: data.etag };
  }

  async updateEvent(
    providerId: string,
    event: CanonicalEvent,
    etag?: string,
  ): Promise<ProviderRef> {
    const token = await this.tokens.getAccessToken();
    const { data } = await apiFetch<GoogleEvent>(
      this.path(`/${encodeURIComponent(providerId)}`),
      token,
      {
        method: 'PATCH',
        headers: etag ? { 'If-Match': etag } : {},
        body: JSON.stringify(toGoogle(event)),
      },
    );
    return { providerId: data.id, etag: data.etag };
  }

  async deleteEvent(providerId: string, etag?: string): Promise<void> {
    const token = await this.tokens.getAccessToken();
    await apiFetch<void>(this.path(`/${encodeURIComponent(providerId)}`), token, {
      method: 'DELETE',
      headers: etag ? { 'If-Match': etag } : {},
    });
  }
}
