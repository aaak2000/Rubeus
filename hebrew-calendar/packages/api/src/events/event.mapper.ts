import type { Event as DbEvent } from '@prisma/client';
import type { CanonicalEvent } from '@hcal/sync';

/**
 * Map a stored event to the provider-neutral shape used for sync.
 *
 * Hebrew-date recurrences are exported to external calendars as an approximate
 * yearly RRULE (external calendars cannot express Hebrew-calendar rules); the
 * app's own UI renders the precise Hebrew occurrences.
 */
export function eventToCanonical(e: DbEvent): CanonicalEvent {
  const c: CanonicalEvent = {
    uid: e.id,
    title: e.title,
    start: e.startUtc.toISOString(),
    end: e.endUtc.toISOString(),
    allDay: e.allDay,
    updatedAt: e.updatedAt.toISOString(),
  };
  if (e.description) c.description = e.description;
  if (e.location) c.location = e.location;
  if (e.rrule) c.rrule = e.rrule;
  else if (e.hebrewRecurrence) c.rrule = 'FREQ=YEARLY';
  return c;
}

/** Build Prisma create/update data from an incoming canonical event. */
export function canonicalToEventData(c: CanonicalEvent) {
  return {
    title: c.title,
    description: c.description ?? null,
    location: c.location ?? null,
    startUtc: new Date(c.start),
    endUtc: new Date(c.end),
    allDay: c.allDay ?? false,
    rrule: c.rrule ?? null,
  };
}
