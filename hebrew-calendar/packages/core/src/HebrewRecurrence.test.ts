import { describe, expect, it } from 'vitest';
import { HebrewRecurrence } from './HebrewRecurrence.js';

const rec = new HebrewRecurrence();

// 2014-03-02 == 30 Adar I 5774 — the canonical leap-year edge case.
const yahrzeit = { kind: 'yahrzeit' as const, originalGregorian: '2014-03-02' };
const birthday = { kind: 'birthday' as const, originalGregorian: '2014-03-02' };

describe('HebrewRecurrence', () => {
  it('computes yahrzeit for a 30 Adar I death in a non-leap year (=> 30 Shvat)', () => {
    const occ = rec.occurrenceInHebrewYear(yahrzeit, 5780);
    expect(occ?.gregorian).toBe('2020-02-25');
    expect(occ?.hebrew.monthName).toBe("Sh'vat");
    expect(occ?.hebrew.day).toBe(30);
  });

  it('computes birthday/anniversary for the same date (=> 1 Nisan)', () => {
    const occ = rec.occurrenceInHebrewYear(birthday, 5780);
    expect(occ?.gregorian).toBe('2020-03-26');
    expect(occ?.hebrew.monthName).toBe('Nisan');
    expect(occ?.hebrew.day).toBe(1);
  });

  it('returns undefined for a year at/before the original', () => {
    expect(rec.occurrenceInHebrewYear(yahrzeit, 5774)).toBeUndefined();
  });

  it('finds the next occurrence on or after a given date', () => {
    const next = rec.nextOccurrence(yahrzeit, new Date(2020, 0, 1));
    expect(next?.gregorian).toBe('2020-02-25');
  });

  it('materializes occurrences within a Gregorian range', () => {
    const occ = rec.occurrencesBetween(yahrzeit, '2019-01-01', '2021-12-31');
    expect(occ.length).toBeGreaterThanOrEqual(2);
    expect(occ.every((o) => o.hebrew.day > 0)).toBe(true);
  });
});
