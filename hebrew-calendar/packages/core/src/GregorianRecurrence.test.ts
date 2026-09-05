import { describe, expect, it } from 'vitest';
import { GregorianRecurrence } from './GregorianRecurrence.js';

const rec = new GregorianRecurrence();
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('GregorianRecurrence', () => {
  it('expands a weekly rule with a count', () => {
    const dtstart = new Date(Date.UTC(2024, 0, 3, 9, 0, 0));
    const occ = rec.occurrencesBetween('FREQ=WEEKLY;COUNT=6', dtstart, '2024-01-01', '2024-02-29');
    expect(occ.map(iso)).toEqual([
      '2024-01-03',
      '2024-01-10',
      '2024-01-17',
      '2024-01-24',
      '2024-01-31',
      '2024-02-07',
    ]);
  });

  it('preserves the anchor time-of-day on each occurrence', () => {
    const dtstart = new Date(Date.UTC(2024, 0, 3, 9, 30, 0));
    const occ = rec.occurrencesBetween('FREQ=WEEKLY;COUNT=2', dtstart, '2024-01-01', '2024-01-31');
    expect(occ[0]!.toISOString()).toBe('2024-01-03T09:30:00.000Z');
  });

  it('only returns occurrences within the queried window (crossing months)', () => {
    const dtstart = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    const occ = rec.occurrencesBetween('FREQ=MONTHLY', dtstart, '2024-03-01', '2024-05-31');
    expect(occ.map(iso)).toEqual(['2024-03-15', '2024-04-15', '2024-05-15']);
  });

  it('bounds an unbounded (no COUNT/UNTIL) rule by the window', () => {
    const dtstart = new Date(Date.UTC(2020, 0, 1, 12, 0, 0));
    const occ = rec.occurrencesBetween('FREQ=DAILY', dtstart, '2024-06-01', '2024-06-30');
    expect(occ.length).toBe(30);
  });

  it('validates rule strings', () => {
    expect(rec.isValid('FREQ=WEEKLY')).toBe(true);
  });
});
