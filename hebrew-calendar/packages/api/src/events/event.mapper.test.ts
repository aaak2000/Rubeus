import type { Event as DbEvent } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canonicalToEventData, eventToCanonical } from './event.mapper';

function dbEvent(over: Partial<DbEvent> = {}): DbEvent {
  return {
    id: 'e1',
    calendarId: 'c1',
    title: 'פגישה',
    description: null,
    location: null,
    startUtc: new Date('2024-06-01T09:00:00Z'),
    endUtc: new Date('2024-06-01T10:00:00Z'),
    allDay: false,
    rrule: null,
    hebrewRecurrence: null,
    hebrewRecurrenceDate: null,
    createdAt: new Date('2024-05-01T00:00:00Z'),
    updatedAt: new Date('2024-05-02T00:00:00Z'),
    ...over,
  } as DbEvent;
}

describe('event.mapper', () => {
  it('maps a stored event to canonical form', () => {
    const c = eventToCanonical(dbEvent());
    expect(c.uid).toBe('e1');
    expect(c.start).toBe('2024-06-01T09:00:00.000Z');
    expect(c.rrule).toBeUndefined();
  });

  it('exports a Hebrew recurrence as an approximate yearly RRULE', () => {
    const c = eventToCanonical(dbEvent({ hebrewRecurrence: 'yahrzeit' }));
    expect(c.rrule).toBe('FREQ=YEARLY');
  });

  it('builds Prisma data from a canonical event', () => {
    const data = canonicalToEventData({
      uid: 'x',
      title: 'T',
      start: '2024-06-01T09:00:00Z',
      end: '2024-06-01T10:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
    });
    expect(data.startUtc).toBeInstanceOf(Date);
    expect(data.allDay).toBe(false);
    expect(data.rrule).toBeNull();
  });
});
