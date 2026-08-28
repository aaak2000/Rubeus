import { HDate, HebrewCalendar } from '@hebcal/core';
import type { DateConversion, HebrewRecurrenceKind } from './types.js';
import { fromIsoDate, toIsoDate } from './dateUtils.js';
import { hebrewDateService } from './HebrewDateService.js';

/** Definition of a recurring Hebrew-date event. */
export interface HebrewRecurrenceSpec {
  kind: HebrewRecurrenceKind;
  /** Gregorian ISO date of the original event (death / birth / anniversary). */
  originalGregorian: string;
}

/**
 * Computes occurrences of Hebrew-date anniversaries (yahrzeit, birthday,
 * wedding anniversary) that recur by the Hebrew calendar rather than the
 * Gregorian one.
 *
 * The subtle rules — Adar vs. Adar II in leap years, 30-day months such as
 * Marcheshvan/Kislev/Adar I that do not occur every year — are handled by
 * `@hebcal/core`'s `HebrewCalendar.getYahrzeit` / `getBirthdayOrAnniversary`,
 * which implement the algorithm from Reingold & Dershowitz's
 * "Calendrical Calculations".
 */
export class HebrewRecurrence {
  /**
   * The occurrence of the recurrence in a specific Hebrew year, or undefined
   * when that year precedes or equals the original year.
   */
  occurrenceInHebrewYear(spec: HebrewRecurrenceSpec, hebrewYear: number): DateConversion | undefined {
    const original = new HDate(fromIsoDate(spec.originalGregorian));
    const hd =
      spec.kind === 'yahrzeit'
        ? HebrewCalendar.getYahrzeit(hebrewYear, original)
        : HebrewCalendar.getBirthdayOrAnniversary(hebrewYear, original);
    if (!hd) return undefined;
    return hebrewDateService.describe(hd);
  }

  /**
   * The next occurrence strictly on or after `from` (default: today).
   * Searches forward across Hebrew years (handles the leap-year edge cases).
   */
  nextOccurrence(spec: HebrewRecurrenceSpec, from: Date = new Date()): DateConversion | undefined {
    const startHYear = new HDate(from).getFullYear();
    // Look a few Hebrew years ahead; some recurrences skip a year (e.g. 30 Adar I).
    for (let hy = startHYear; hy <= startHYear + 4; hy++) {
      const occ = this.occurrenceInHebrewYear(spec, hy);
      if (occ && fromIsoDate(occ.gregorian).getTime() >= atMidnight(from).getTime()) {
        return occ;
      }
    }
    return undefined;
  }

  /**
   * Materialize occurrences within a Gregorian date range (inclusive).
   * Used when exporting Hebrew recurrences to external calendars that only
   * understand concrete instances.
   */
  occurrencesBetween(spec: HebrewRecurrenceSpec, startIso: string, endIso: string): DateConversion[] {
    const start = fromIsoDate(startIso);
    const end = fromIsoDate(endIso);
    const out: DateConversion[] = [];
    const startHY = new HDate(start).getFullYear();
    const endHY = new HDate(end).getFullYear();
    for (let hy = startHY; hy <= endHY + 1; hy++) {
      const occ = this.occurrenceInHebrewYear(spec, hy);
      if (!occ) continue;
      const t = fromIsoDate(occ.gregorian).getTime();
      if (t >= atMidnight(start).getTime() && t <= atMidnight(end).getTime()) {
        out.push(occ);
      }
    }
    return out;
  }
}

function atMidnight(d: Date): Date {
  return fromIsoDate(toIsoDate(d));
}

export const hebrewRecurrence = new HebrewRecurrence();
