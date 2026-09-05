import { describe, expect, it } from 'vitest';
import type { CanonicalEvent } from '../types.js';
import { IcsCodec } from './IcsCodec.js';

const codec = new IcsCodec();

const sample: CanonicalEvent = {
  uid: 'evt-1',
  title: 'בדיקת אירוע',
  description: 'תיאור',
  location: 'ירושלים',
  start: '2024-04-23T10:00:00Z',
  end: '2024-04-23T11:00:00Z',
  allDay: false,
  updatedAt: '2024-04-01T00:00:00Z',
};

describe('IcsCodec', () => {
  it('exports a canonical event to a valid VEVENT', () => {
    const ics = codec.export([sample]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:evt-1');
    expect(ics).toContain('SUMMARY:בדיקת אירוע');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('round-trips export -> import preserving core fields', () => {
    const ics = codec.export([sample]);
    const [parsed] = codec.import(ics);
    expect(parsed.uid).toBe('evt-1');
    expect(parsed.title).toBe('בדיקת אירוע');
    expect(parsed.location).toBe('ירושלים');
    expect(new Date(parsed.start).toISOString()).toBe('2024-04-23T10:00:00.000Z');
    expect(new Date(parsed.end).toISOString()).toBe('2024-04-23T11:00:00.000Z');
  });

  it('preserves an RRULE through a round-trip', () => {
    const recurring: CanonicalEvent = { ...sample, uid: 'evt-2', rrule: 'FREQ=YEARLY;INTERVAL=1' };
    const [parsed] = codec.import(codec.export([recurring]));
    expect(parsed.rrule).toContain('FREQ=YEARLY');
  });
});
