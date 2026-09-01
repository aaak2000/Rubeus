import { describe, expect, it } from 'vitest';
import {
  isValidTimeZone,
  utcToZonedParts,
  zonedDateKey,
  zonedDateTimeToUtc,
  zonedTimeKey,
  zonedWallTimeToUtc,
  zoneOffsetMs,
} from './timezone.js';

const JLM = 'Asia/Jerusalem';
const HOUR = 3600_000;

describe('timezone — wall clock to UTC', () => {
  it('converts winter time in Jerusalem (UTC+2)', () => {
    // 2024-01-15 09:00 IST = 07:00Z
    expect(zonedWallTimeToUtc(2024, 1, 15, 9, 0, 0, JLM).toISOString()).toBe(
      '2024-01-15T07:00:00.000Z',
    );
  });

  it('converts summer time in Jerusalem (UTC+3, DST)', () => {
    // 2024-06-21 09:00 IDT = 06:00Z — the bug this replaces stored 09:00Z
    expect(zonedWallTimeToUtc(2024, 6, 21, 9, 0, 0, JLM).toISOString()).toBe(
      '2024-06-21T06:00:00.000Z',
    );
  });

  it('handles the day before and after the spring-forward transition', () => {
    // Israel DST 2024 began 2024-03-29 02:00 -> 03:00
    expect(zonedWallTimeToUtc(2024, 3, 28, 12, 0, 0, JLM).toISOString()).toBe(
      '2024-03-28T10:00:00.000Z',
    );
    expect(zonedWallTimeToUtc(2024, 3, 30, 12, 0, 0, JLM).toISOString()).toBe(
      '2024-03-30T09:00:00.000Z',
    );
  });

  it('handles the day before and after the fall-back transition', () => {
    // Israel DST 2024 ended 2024-10-27 02:00 -> 01:00
    expect(zonedWallTimeToUtc(2024, 10, 26, 12, 0, 0, JLM).toISOString()).toBe(
      '2024-10-26T09:00:00.000Z',
    );
    expect(zonedWallTimeToUtc(2024, 10, 28, 12, 0, 0, JLM).toISOString()).toBe(
      '2024-10-28T10:00:00.000Z',
    );
  });

  it('supports half-hour offset zones', () => {
    // Asia/Kolkata is UTC+5:30 year round
    expect(zonedWallTimeToUtc(2024, 6, 21, 9, 0, 0, 'Asia/Kolkata').toISOString()).toBe(
      '2024-06-21T03:30:00.000Z',
    );
  });

  it('is the inverse of utcToZonedParts', () => {
    const instant = new Date('2024-06-21T06:00:00.000Z');
    const p = utcToZonedParts(instant, JLM);
    expect(p).toMatchObject({ year: 2024, month: 6, day: 21, hour: 9, minute: 0 });
    expect(
      zonedWallTimeToUtc(p.year, p.month, p.day, p.hour, p.minute, p.second, JLM).toISOString(),
    ).toBe(instant.toISOString());
  });

  it('reports the offset in effect at an instant', () => {
    expect(zoneOffsetMs(new Date('2024-01-15T12:00:00Z'), JLM)).toBe(2 * HOUR);
    expect(zoneOffsetMs(new Date('2024-06-21T12:00:00Z'), JLM)).toBe(3 * HOUR);
  });
});

describe('timezone — day bucketing', () => {
  it('files a late-evening event under the correct local day', () => {
    // 2024-06-21T22:30Z is already 2024-06-22 01:30 in Jerusalem.
    const instant = new Date('2024-06-21T22:30:00Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2024-06-21'); // the old, wrong behaviour
    expect(zonedDateKey(instant, JLM)).toBe('2024-06-22'); // correct
  });

  it('files an early-morning UTC instant under the same local day', () => {
    expect(zonedDateKey(new Date('2024-06-21T06:00:00Z'), JLM)).toBe('2024-06-21');
  });

  it('renders local wall-clock time', () => {
    expect(zonedTimeKey(new Date('2024-06-21T06:00:00Z'), JLM)).toBe('09:00');
  });

  it('handles midnight without rolling the day', () => {
    const midnight = zonedDateTimeToUtc('2024-06-21', '00:00', JLM);
    expect(zonedDateKey(midnight, JLM)).toBe('2024-06-21');
    expect(zonedTimeKey(midnight, JLM)).toBe('00:00');
  });
});

describe('timezone — parsing and validation', () => {
  it('parses date plus time strings', () => {
    expect(zonedDateTimeToUtc('2024-06-21', '09:00', JLM).toISOString()).toBe(
      '2024-06-21T06:00:00.000Z',
    );
  });

  it('treats a missing time as local midnight', () => {
    expect(zonedDateTimeToUtc('2024-06-21', undefined, JLM).toISOString()).toBe(
      '2024-06-20T21:00:00.000Z',
    );
  });

  it('rejects malformed input', () => {
    expect(() => zonedDateTimeToUtc('nope', '09:00', JLM)).toThrow(/Invalid date/);
    expect(() => zonedDateTimeToUtc('2024-06-21', '9am', JLM)).toThrow(/Invalid time/);
  });

  it('validates timezone identifiers', () => {
    expect(isValidTimeZone(JLM)).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});
