import ICAL from 'ical.js';
import { createEvents, type DateArray, type EventAttributes } from 'ics';
import type { CanonicalEvent } from '../types.js';

/** Convert an ISO instant to a UTC [Y, M, D, h, m] tuple for the `ics` lib. */
function toDateArray(iso: string, allDay: boolean): DateArray {
  const d = new Date(iso);
  if (allDay) {
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

/**
 * Import/export of iCalendar (`.ics`) files.
 *
 * Parsing uses `ical.js`; generation uses `ics`. This is a file codec rather
 * than a live {@link CalendarProvider}: ICS files support manual import/export,
 * not incremental two-way sync.
 */
export class IcsCodec {
  /** Parse an ICS document into canonical events. */
  import(icsText: string): CanonicalEvent[] {
    const jcal = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');
    return vevents.map((ve) => {
      const ev = new ICAL.Event(ve);
      const allDay = ev.startDate.isDate;
      const rrule = ve.getFirstPropertyValue('rrule');
      const lastMod = ve.getFirstPropertyValue('last-modified') ?? ve.getFirstPropertyValue('dtstamp');
      const out: CanonicalEvent = {
        uid: ev.uid || cryptoRandomId(),
        title: ev.summary || '',
        start: ev.startDate.toJSDate().toISOString(),
        end: ev.endDate.toJSDate().toISOString(),
        allDay,
        updatedAt:
          lastMod && typeof (lastMod as { toJSDate?: () => Date }).toJSDate === 'function'
            ? (lastMod as { toJSDate: () => Date }).toJSDate().toISOString()
            : new Date().toISOString(),
      };
      if (ev.description) out.description = ev.description;
      if (ev.location) out.location = ev.location;
      if (rrule) out.rrule = rrule.toString();
      return out;
    });
  }

  /** Serialize canonical events into a single ICS document. */
  export(events: CanonicalEvent[], calName = 'Hebrew Calendar'): string {
    const attrs: EventAttributes[] = events.map((e) => {
      const allDay = e.allDay ?? false;
      const a: EventAttributes = {
        uid: e.uid,
        title: e.title,
        start: toDateArray(e.start, allDay),
        end: toDateArray(e.end, allDay),
        startInputType: 'utc',
        startOutputType: 'utc',
        endInputType: 'utc',
        calName,
      };
      if (e.description) a.description = e.description;
      if (e.location) a.location = e.location;
      if (e.rrule) a.recurrenceRule = e.rrule;
      return a;
    });
    const { error, value } = createEvents(attrs);
    if (error) throw error;
    return value ?? '';
  }
}

function cryptoRandomId(): string {
  return 'hcal-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const icsCodec = new IcsCodec();
