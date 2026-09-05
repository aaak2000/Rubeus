import type { CalendarProvider, CanonicalEvent, ChangeSet, ProviderRef } from '../types.js';
import { IcsCodec } from './IcsCodec.js';
import { HttpError } from './support.js';

export interface CalDavConfig {
  /** Full URL of the calendar collection (…/calendars/user/calendar-id/). */
  collectionUrl: string;
  /** Basic-auth username (e.g. Apple ID). */
  username: string;
  /** Basic-auth password / app-specific password. */
  password: string;
}

interface DavResource {
  href: string;
  etag?: string;
  calendarData?: string;
}

/**
 * CalDAV adapter (RFC 4791) speaking raw WebDAV over fetch: `sync-collection`
 * REPORT for incremental changes, `PUT`/`DELETE` with ETags for writes. Each
 * event resource is a VEVENT (de)serialized via {@link IcsCodec}.
 *
 * Note: requires a live CalDAV server and credentials; validate against your
 * target server (iCloud, Fastmail, Radicale, Nextcloud) before relying on it.
 */
export class CalDavAdapter implements CalendarProvider {
  readonly name = 'caldav';
  private readonly codec = new IcsCodec();

  constructor(private readonly config: CalDavConfig) {}

  private authHeader(): string {
    const raw = `${this.config.username}:${this.config.password}`;
    return `Basic ${Buffer.from(raw).toString('base64')}`;
  }

  private resourceUrl(href: string): string {
    if (href.startsWith('http')) return href;
    const base = new URL(this.config.collectionUrl);
    return `${base.origin}${href}`;
  }

  private async dav(
    method: string,
    url: string,
    body?: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': body?.startsWith('BEGIN:')
          ? 'text/calendar; charset=utf-8'
          : 'application/xml; charset=utf-8',
        ...extraHeaders,
      },
      body,
    });
    if (!res.ok && res.status !== 207) {
      throw new HttpError(res.status, url, await res.text());
    }
    return res;
  }

  async listChanges(sinceToken?: string): Promise<ChangeSet> {
    // sync-collection REPORT (RFC 6578); falls back to full listing if the
    // server rejects the sync-token.
    const report = `<?xml version="1.0" encoding="utf-8"?>
<d:sync-collection xmlns:d="DAV:">
  <d:sync-token>${sinceToken ?? ''}</d:sync-token>
  <d:sync-level>1</d:sync-level>
  <d:prop><d:getetag/><c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav"/></d:prop>
</d:sync-collection>`;
    let res: Response;
    try {
      res = await this.dav('REPORT', this.config.collectionUrl, report, { Depth: '1' });
    } catch {
      return this.fullList();
    }
    const xml = await res.text();
    const nextToken = extractTag(xml, 'sync-token');
    const changes: ChangeSet['changes'] = parseMultistatus(xml).map((r) => {
      if (!r.calendarData) return { providerId: r.href, event: null };
      const [event] = this.codec.import(r.calendarData);
      return { providerId: r.href, event: event ? { ...event, uid: r.href } : null, etag: r.etag };
    });
    return { changes, nextToken };
  }

  private async fullList(): Promise<ChangeSet> {
    const query = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
</c:calendar-query>`;
    const res = await this.dav('REPORT', this.config.collectionUrl, query, { Depth: '1' });
    const xml = await res.text();
    const changes: ChangeSet['changes'] = parseMultistatus(xml)
      .filter((r) => r.calendarData)
      .map((r) => {
        const [event] = this.codec.import(r.calendarData!);
        return {
          providerId: r.href,
          event: event ? { ...event, uid: r.href } : null,
          etag: r.etag,
        };
      });
    return { changes, nextToken: undefined };
  }

  private eventHref(event: CanonicalEvent): string {
    const id =
      event.uid.startsWith('http') || event.uid.includes('/')
        ? lastSegment(event.uid)
        : `${event.uid}.ics`;
    return this.resourceUrl(new URL(id, this.config.collectionUrl).pathname);
  }

  async createEvent(event: CanonicalEvent): Promise<ProviderRef> {
    const href = this.eventHref(event);
    const ics = this.codec.export([{ ...event, uid: lastSegment(href).replace(/\.ics$/, '') }]);
    const res = await this.dav('PUT', href, ics, { 'If-None-Match': '*' });
    return { providerId: href, etag: res.headers.get('etag') ?? undefined };
  }

  async updateEvent(
    providerId: string,
    event: CanonicalEvent,
    etag?: string,
  ): Promise<ProviderRef> {
    const href = this.resourceUrl(providerId);
    const ics = this.codec.export([{ ...event, uid: lastSegment(href).replace(/\.ics$/, '') }]);
    const res = await this.dav('PUT', href, ics, etag ? { 'If-Match': etag } : {});
    return { providerId, etag: res.headers.get('etag') ?? undefined };
  }

  async deleteEvent(providerId: string, etag?: string): Promise<void> {
    const href = this.resourceUrl(providerId);
    await this.dav('DELETE', href, undefined, etag ? { 'If-Match': etag } : {});
  }
}

// --- tiny WebDAV multistatus helpers (namespace-prefix agnostic) ---

function parseMultistatus(xml: string): DavResource[] {
  const out: DavResource[] = [];
  const responseRe = /<[a-z0-9]*:?response[\s>]([\s\S]*?)<\/[a-z0-9]*:?response>/gi;
  let m: RegExpExecArray | null;
  // The standard way to walk a global regex; hoisting the assignment out of
  // the condition needs a duplicated exec call.
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
  while ((m = responseRe.exec(xml))) {
    const block = m[1] ?? '';
    const href = extractTag(block, 'href');
    if (!href) continue;
    const resource: DavResource = { href: decodeXml(href) };
    const etag = extractTag(block, 'getetag');
    if (etag) resource.etag = etag.replace(/^"|"$/g, '');
    const data = extractTag(block, 'calendar-data');
    if (data) resource.calendarData = decodeXml(data);
    out.push(resource);
  }
  return out;
}

function extractTag(xml: string, local: string): string | undefined {
  const re = new RegExp(`<[a-z0-9]*:?${local}[^>]*>([\\s\\S]*?)</[a-z0-9]*:?${local}>`, 'i');
  const m = re.exec(xml);
  return m && m[1] !== undefined ? m[1].trim() : undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#13;/g, '')
    .replace(/&amp;/g, '&');
}

function lastSegment(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
