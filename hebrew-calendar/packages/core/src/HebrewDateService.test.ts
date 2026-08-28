import { describe, expect, it } from 'vitest';
import { HebrewDateService } from './HebrewDateService.js';

const svc = new HebrewDateService();

describe('HebrewDateService', () => {
  it('converts a known Gregorian date to Hebrew (13 Nov 2008 => 15 Cheshvan 5769)', () => {
    const c = svc.fromGregorian('2008-11-13');
    expect(c.hebrew.year).toBe(5769);
    expect(c.hebrew.monthName).toBe('Cheshvan');
    expect(c.hebrew.day).toBe(15);
    // gematriya rendering (nikud suppressed for a stable assertion)
    const hd = svc.fromHebrew(5769, HebrewDateService.months.CHESHVAN, 15);
    expect(hd.gregorian).toBe('2008-11-13');
  });

  it('round-trips Hebrew -> Gregorian -> Hebrew', () => {
    const fwd = svc.fromHebrew(5784, HebrewDateService.months.TISHREI, 1);
    expect(fwd.gregorian).toBe('2023-09-16'); // 1 Tishrei 5784
    const back = svc.fromGregorian(fwd.gregorian);
    expect(back.hebrew).toEqual(fwd.hebrew);
  });

  it('identifies leap years and month counts', () => {
    expect(svc.isLeapYear(5784)).toBe(true);
    expect(svc.isLeapYear(5783)).toBe(false);
    expect(svc.monthsInYear(5784)).toBe(13);
    expect(svc.monthsInYear(5783)).toBe(12);
  });

  it('renders gematriya text', () => {
    const c = svc.fromGregorian('2008-11-13');
    expect(c.hebrewText).toContain('תשס״ט'); // year 5769 in gematriya
  });

  it('validates Gregorian input', () => {
    expect(svc.isValidGregorian('2024-01-01')).toBe(true);
    expect(svc.isValidGregorian('not-a-date')).toBe(false);
  });
});
