import { describe, expect, it } from 'vitest';
import { HDate } from '@hebcal/core';
import {
  eveningOf,
  hebrewDateOfDeath,
  hebrewDayBounds,
  hebrewDayKeyAt,
  hebrewDayStart,
} from './HebrewDay.js';
import { zonedDateTimeToUtc } from './timezone.js';

const JERUSALEM = { latitude: 31.7683, longitude: 35.2137, tzid: 'Asia/Jerusalem' };
const TZ = 'Asia/Jerusalem';

/** An instant at a wall-clock time in Jerusalem. */
function at(dateIso: string, time: string): Date {
  return zonedDateTimeToUtc(dateIso, time, TZ);
}

describe('hebrewDayKeyAt', () => {
  it('files a morning event under its own Gregorian day', () => {
    expect(hebrewDayKeyAt(at('2026-09-16', '09:00'), TZ, JERUSALEM)).toBe('2026-09-16');
  });

  it('files an evening event under the next day, because the Hebrew day has begun', () => {
    // Sunset in Jerusalem on 16 Sep 2026 is about 18:43.
    expect(hebrewDayKeyAt(at('2026-09-16', '21:00'), TZ, JERUSALEM)).toBe('2026-09-17');
  });

  it('does not roll over just before sunset', () => {
    expect(hebrewDayKeyAt(at('2026-09-16', '18:00'), TZ, JERUSALEM)).toBe('2026-09-16');
  });

  it('rolls over exactly at sunset, not a minute later', () => {
    const sunset = hebrewDayBounds('2026-09-17', TZ, JERUSALEM).start;
    expect(hebrewDayKeyAt(sunset, TZ, JERUSALEM)).toBe('2026-09-17');
    expect(hebrewDayKeyAt(new Date(sunset.getTime() - 1), TZ, JERUSALEM)).toBe('2026-09-16');
  });

  it('is the calendar day when no location is known', () => {
    // Correct until sunset, and honest rather than guessing a sunset.
    expect(hebrewDayKeyAt(at('2026-09-16', '21:00'), TZ)).toBe('2026-09-16');
  });

  it('crosses the Gregorian month boundary', () => {
    expect(hebrewDayKeyAt(at('2026-09-30', '20:30'), TZ, JERUSALEM)).toBe('2026-10-01');
  });
});

describe('hebrewDayBounds', () => {
  it('runs from sunset the evening before to sunset', () => {
    const b = hebrewDayBounds('2026-09-19', TZ, JERUSALEM);
    expect(b.fromSunset).toBe(true);
    // Starts on the 18th (Friday evening), ends on the 19th.
    expect(b.start.getTime()).toBeLessThan(at('2026-09-19', '00:00').getTime());
    expect(b.end.getTime()).toBeGreaterThan(at('2026-09-19', '12:00').getTime());
    expect(b.end.getTime()).toBeLessThan(at('2026-09-20', '00:00').getTime());
  });

  it('spans roughly 24 hours', () => {
    const b = hebrewDayBounds('2026-09-19', TZ, JERUSALEM);
    const hours = (b.end.getTime() - b.start.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.5);
    expect(hours).toBeLessThan(24.5);
  });

  it('an evening instant falls inside the day it belongs to', () => {
    const b = hebrewDayBounds('2026-09-17', TZ, JERUSALEM);
    const evening = at('2026-09-16', '21:00');
    expect(evening.getTime()).toBeGreaterThanOrEqual(b.start.getTime());
    expect(evening.getTime()).toBeLessThan(b.end.getTime());
  });

  it('falls back to local midnight without a location, and says so', () => {
    const b = hebrewDayBounds('2026-09-19', TZ);
    expect(b.fromSunset).toBe(false);
    expect(b.start.getTime()).toBe(at('2026-09-19', '00:00').getTime());
    expect(b.end.getTime()).toBe(at('2026-09-20', '00:00').getTime());
  });

  it('consecutive Hebrew days meet exactly, with no gap or overlap', () => {
    const a = hebrewDayBounds('2026-09-19', TZ, JERUSALEM);
    const b = hebrewDayBounds('2026-09-20', TZ, JERUSALEM);
    expect(b.start.getTime()).toBe(a.end.getTime());
  });

  it('is unaffected by a daylight-saving transition', () => {
    // Israel leaves DST on 25 October 2026. A midnight-to-midnight day would
    // be 25 hours long; sunset to sunset is unmoved, because the sun is.
    const b = hebrewDayBounds('2026-10-25', TZ, JERUSALEM);
    const hours = (b.end.getTime() - b.start.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.5);
    expect(hours).toBeLessThan(24.5);
  });
});

describe('hebrewDayStart', () => {
  it('is the sunset that opens the day', () => {
    const start = hebrewDayStart('2026-09-17', TZ, JERUSALEM);
    expect(start).not.toBeNull();
    expect(start!.getTime()).toBe(hebrewDayBounds('2026-09-17', TZ, JERUSALEM).start.getTime());
  });

  it('is null without a location, rather than a made-up midnight', () => {
    expect(hebrewDayStart('2026-09-17', TZ)).toBeNull();
  });
});

describe('eveningOf', () => {
  it('names the Gregorian evening that opens a Hebrew day', () => {
    expect(eveningOf('2026-09-17')).toBe('2026-09-16');
  });

  it('steps back across a month boundary', () => {
    expect(eveningOf('2026-10-01')).toBe('2026-09-30');
  });
});

describe('hebrewDateOfDeath', () => {
  it('uses the same Hebrew date for a daytime death', () => {
    const hd = hebrewDateOfDeath('2026-09-16', false);
    expect(hd.getDate()).toBe(new HDate(new Date(Date.UTC(2026, 8, 16))).getDate());
  });

  it('advances a day when death was after sunset', () => {
    const day = hebrewDateOfDeath('2026-09-16', false);
    const evening = hebrewDateOfDeath('2026-09-16', true);
    expect(evening.abs() - day.abs()).toBe(1);
  });

  it('crosses into the next Hebrew month when death was on the last day of it', () => {
    // 29 Elul 5786 falls on 11 Sep 2026; after sunset it is already 1 Tishrei.
    const evening = hebrewDateOfDeath('2026-09-11', true);
    expect(evening.getDate()).toBe(1);
    expect(evening.getMonthName()).toBe('Tishrei');
    expect(evening.getFullYear()).toBe(5787);
  });
});
