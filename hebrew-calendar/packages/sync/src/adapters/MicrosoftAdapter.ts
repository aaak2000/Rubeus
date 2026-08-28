import type { CalendarProvider, CanonicalEvent, ChangeSet, ProviderRef } from '../types.js';
import { apiFetch, type TokenSource } from './support.js';

const BASE = 'https://graph.microsoft.com/v1.0';

interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}
interface GraphEvent {
  id: string;
  subject?: string;
  body?: { contentType: string; content: string };
  location?: { displayName?: string };
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  lastModifiedDateTime?: string;
  '@removed'?: { reason: string };
}
interface GraphDeltaResponse {
  value: GraphEvent[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

function fromGraph(g: GraphEvent): CanonicalEvent {
  // Graph returns wall-clock time plus a timeZone; normalize to UTC ISO.
  const toIso = (t?: GraphDateTime): string =>
    t ? new Date(`${t.dateTime}${t.dateTime.endsWith('Z') ? '' : 'Z'}`).toISOString() : '';
  const ev: CanonicalEvent = {
    uid: g.id,
    title: g.subject ?? '',
    start: toIso(g.start),
    end: toIso(g.end),
    allDay: Boolean(g.isAllDay),
    updatedAt: g.lastModifiedDateTime ?? new Date().toISOString(),
  };
  if (g.body?.content) ev.description = g.body.content;
  if (g.location?.displayName) ev.location = g.location.displayName;
  return ev;
}

function toGraph(e: CanonicalEvent): Record<string, unknown> {
  return {
    subject: e.title,
    body: e.description ? { contentType: 'text', content: e.description } : undefined,
    location: e.location ? { displayName: e.location } : undefined,
    isAllDay: e.allDay ?? false,
    start: { dateTime: e.start.replace(/Z$/, ''), timeZone: 'UTC' },
    end: { dateTime: e.end.replace(/Z$/, ''), timeZone: 'UTC' },
  };
}

/**
 * Microsoft Graph adapter using calendar-view delta queries for incremental
 * sync. `sinceToken` is the opaque `@odata.deltaLink` from the previous run.
 */
export class MicrosoftAdapter implements CalendarProvider {
  readonly name = 'microsoft';

  constructor(
    private readonly tokens: TokenSource,
    private readonly calendarId?: string,
  ) {}

  private eventsPath(): string {
    return this.calendarId ? `${BASE}/me/calendars/${this.calendarId}/events` : `${BASE}/me/events`;
  }

  private deltaSeedUrl(): string {
    const base = this.calendarId ? `${BASE}/me/calendars/${this.calendarId}/calendarView/delta` : `${BASE}/me/calendarView/delta`;
    const start = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    return `${base}?startDateTime=${start}&endDateTime=${end}`;
  }

  async listChanges(sinceToken?: string): Promise<ChangeSet> {
    const token = await this.tokens.getAccessToken();
    const changes: ChangeSet['changes'] = [];
    let url: string | undefined = sinceToken ?? this.deltaSeedUrl();
    let deltaLink: string | undefined;
    while (url) {
      const { data }: { data: GraphDeltaResponse } = await apiFetch<GraphDeltaResponse>(url, token, {
        headers: { Prefer: 'odata.maxpagesize=100' },
      });
      for (const item of data.value ?? []) {
        if (item['@removed']) changes.push({ providerId: item.id, event: null });
        else changes.push({ providerId: item.id, event: fromGraph(item) });
      }
      deltaLink = data['@odata.deltaLink'] ?? deltaLink;
      url = data['@odata.nextLink'];
    }
    return { changes, nextToken: deltaLink };
  }

  async createEvent(event: CanonicalEvent): Promise<ProviderRef> {
    const token = await this.tokens.getAccessToken();
    const { data } = await apiFetch<GraphEvent>(this.eventsPath(), token, {
      method: 'POST',
      body: JSON.stringify(toGraph(event)),
    });
    return { providerId: data.id };
  }

  async updateEvent(providerId: string, event: CanonicalEvent): Promise<ProviderRef> {
    const token = await this.tokens.getAccessToken();
    const { data } = await apiFetch<GraphEvent>(`${this.eventsPath()}/${providerId}`, token, {
      method: 'PATCH',
      body: JSON.stringify(toGraph(event)),
    });
    return { providerId: data.id };
  }

  async deleteEvent(providerId: string): Promise<void> {
    const token = await this.tokens.getAccessToken();
    await apiFetch<void>(`${this.eventsPath()}/${providerId}`, token, { method: 'DELETE' });
  }
}
