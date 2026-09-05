import { describe, expect, it } from 'vitest';
import { choiceFromRrule, isComplexRrule, isHebrewChoice, rruleFor } from './recurrence';

describe('building a rule from a choice', () => {
  it('names the weekday for a weekly rule', () => {
    // 2026-09-17 is a Thursday.
    expect(rruleFor('weekly', '2026-09-17')).toBe('FREQ=WEEKLY;BYDAY=TH');
    // 2026-09-19 is a Saturday.
    expect(rruleFor('weekly', '2026-09-19')).toBe('FREQ=WEEKLY;BYDAY=SA');
  });

  it('picks the weekday from the date, not from the machine timezone', () => {
    // Parsed at midday, so a negative offset cannot pull it back a day.
    expect(rruleFor('weekly', '2026-01-01')).toBe('FREQ=WEEKLY;BYDAY=TH');
  });

  it('covers the other frequencies', () => {
    expect(rruleFor('daily', '2026-09-17')).toBe('FREQ=DAILY');
    expect(rruleFor('monthly', '2026-09-17')).toBe('FREQ=MONTHLY');
    expect(rruleFor('yearly', '2026-09-17')).toBe('FREQ=YEARLY');
  });

  it('produces no rule for a Hebrew choice or for none', () => {
    expect(rruleFor('yahrzeit', '2026-09-17')).toBeNull();
    expect(rruleFor('birthday', '2026-09-17')).toBeNull();
    expect(rruleFor('', '2026-09-17')).toBeNull();
  });
});

describe('reading a rule back', () => {
  it('round-trips every choice the form offers', () => {
    for (const choice of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      const rule = rruleFor(choice, '2026-09-17');
      expect(choiceFromRrule(rule)).toBe(choice);
    }
  });

  it('is indifferent to case and to an RRULE: prefix', () => {
    expect(choiceFromRrule('rrule:freq=weekly;byday=tu')).toBe('weekly');
  });

  it('reports nothing for an absent or unrecognised rule', () => {
    expect(choiceFromRrule(null)).toBe('');
    expect(choiceFromRrule('')).toBe('');
    expect(choiceFromRrule('FREQ=HOURLY')).toBe('');
  });
});

describe('rules the form cannot express', () => {
  it('leaves an imported rule alone rather than flattening it', () => {
    // Editing the title of an event that repeats on three weekdays must not
    // quietly turn it into "every Tuesday".
    expect(isComplexRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe(true);
    expect(isComplexRrule('FREQ=DAILY;COUNT=10')).toBe(true);
    expect(isComplexRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toBe(true);
    expect(isComplexRrule('FREQ=MONTHLY;BYMONTHDAY=-1')).toBe(true);
    expect(isComplexRrule('FREQ=YEARLY;UNTIL=20301231T000000Z')).toBe(true);
  });

  it('accepts the rules it wrote itself', () => {
    for (const choice of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      expect(isComplexRrule(rruleFor(choice, '2026-09-17'))).toBe(false);
    }
    expect(isComplexRrule(null)).toBe(false);
  });
});

describe('which calendar a choice belongs to', () => {
  it('separates the Hebrew choices from the rest', () => {
    expect(isHebrewChoice('yahrzeit')).toBe(true);
    expect(isHebrewChoice('birthday')).toBe(true);
    expect(isHebrewChoice('anniversary')).toBe(true);
    expect(isHebrewChoice('weekly')).toBe(false);
    expect(isHebrewChoice('')).toBe(false);
  });
});
