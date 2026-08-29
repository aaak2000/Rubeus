import { RRule } from 'rrule';
import { fromIsoDate } from './dateUtils.js';

/**
 * Expands standard iCalendar recurrence rules (Gregorian RRULE) into concrete
 * occurrence instants. Complements {@link HebrewRecurrence}, which handles
 * recurrences that follow the Hebrew calendar.
 *
 * Stored RRULEs are bare strings (no `DTSTART`); the anchor is supplied
 * separately as `dtstart`. Wraps the standard `rrule` library.
 */
export class GregorianRecurrence {
  /**
   * Occurrence start instants of `rrule` (anchored at `dtstart`) that fall
   * within the inclusive Gregorian date range [startIso, endIso].
   *
   * The window itself bounds the result; `cap` is an extra safety ceiling
   * against pathological rules.
   */
  occurrencesBetween(rrule: string, dtstart: Date, startIso: string, endIso: string, cap = 750): Date[] {
    const options = RRule.parseString(rrule);
    options.dtstart = dtstart;
    const rule = new RRule(options);
    const after = fromIsoDate(startIso);
    const before = new Date(fromIsoDate(endIso).getTime() + 24 * 3600 * 1000 - 1); // end of the last day
    const dates = rule.between(after, before, true);
    return dates.slice(0, cap);
  }

  /** True when a string parses as a valid RRULE. */
  isValid(rrule: string): boolean {
    try {
      RRule.parseString(rrule);
      return true;
    } catch {
      return false;
    }
  }
}

export const gregorianRecurrence = new GregorianRecurrence();
