import { HDate, months } from '@hebcal/core';
import type { DateConversion, HebrewDate } from './types.js';
import { fromIsoDate, isValidDate, toIsoDate } from './dateUtils.js';

/**
 * Conversion and formatting for the Hebrew calendar.
 *
 * Thin, well-typed wrapper over `@hebcal/core`'s `HDate`. All heavy lifting
 * (leap years, Adar I/II, month lengths) is delegated to hebcal — we do not
 * re-implement calendar math.
 */
export class HebrewDateService {
  /** Hebrew month constants (1=Nisan .. 7=Tishrei .. 12=Adar I, 13=Adar II). */
  static readonly months = months;

  /** Convert a Gregorian ISO date (YYYY-MM-DD) to its Hebrew equivalent. */
  fromGregorian(iso: string): DateConversion {
    return this.describe(new HDate(fromIsoDate(iso)));
  }

  /** Convert a Hebrew date (year, month 1-13, day) to Gregorian + rendering. */
  fromHebrew(year: number, month: number, day: number): DateConversion {
    return this.describe(new HDate(day, month, year));
  }

  /** Today's date, described in both calendars. */
  today(now: Date = new Date()): DateConversion {
    return this.describe(new HDate(now));
  }

  /** Render an HDate to the serializable {@link DateConversion} shape. */
  describe(hd: HDate): DateConversion {
    const greg = hd.greg();
    return {
      gregorian: toIsoDate(greg),
      hebrew: this.toPlain(hd),
      hebrewText: hd.renderGematriya(),
    };
  }

  private toPlain(hd: HDate): HebrewDate {
    return {
      year: hd.getFullYear(),
      month: hd.getMonth(),
      day: hd.getDate(),
      monthName: hd.getMonthName(),
    };
  }

  /** Whether a Hebrew year is a leap year (13 months). */
  isLeapYear(hebrewYear: number): boolean {
    return HDate.isLeapYear(hebrewYear);
  }

  /** Number of months in the Hebrew year (12 or 13). */
  monthsInYear(hebrewYear: number): number {
    return HDate.monthsInYear(hebrewYear);
  }

  /** Number of days in a given Hebrew month/year. */
  daysInMonth(month: number, hebrewYear: number): number {
    return HDate.daysInMonth(month, hebrewYear);
  }

  /** English name of a Hebrew month, accounting for leap years. */
  monthName(month: number, hebrewYear: number): string {
    return HDate.getMonthName(month, hebrewYear);
  }

  /** Validate that a Gregorian ISO date can be parsed. */
  isValidGregorian(iso: string): boolean {
    try {
      return isValidDate(fromIsoDate(iso));
    } catch {
      return false;
    }
  }
}

export const hebrewDateService = new HebrewDateService();
