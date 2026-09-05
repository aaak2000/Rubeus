import { HDate } from '@hebcal/core';
import { fromIsoDate, toIsoDate } from './dateUtils.js';
import { zonedDateKey, zonedDateTimeToUtc } from './timezone.js';
import type { GeoPoint } from './types.js';
import { zmanimService } from './ZmanimService.js';

/**
 * The Hebrew day begins in the evening, not at midnight.
 *
 * Every other part of the system keys days off a Gregorian `YYYY-MM-DD`, so
 * this module answers one question in both directions: which Gregorian date
 * names the Hebrew day an instant belongs to, and which instants bound that
 * Hebrew day.
 *
 * A Hebrew day is named here by the Gregorian date of its *daytime* half —
 * the same convention `new HDate(date)` uses. So the Hebrew day named
 * `2026-09-19` runs from sunset on the 18th to sunset on the 19th, and an
 * event at 21:00 on the 18th belongs to it.
 *
 * Sunset is the boundary rather than nightfall: the interval between them
 * (בין השמשות) is halachically doubtful, and a calendar has to pick one
 * instant. Sunset is the earlier and so the safer choice for deciding which
 * day something falls on, and it is the convention printed luchot use.
 */

/** The instants bounding a Hebrew day, as UTC. */
export interface HebrewDayBounds {
  /** When the Hebrew day begins — sunset on the preceding Gregorian day. */
  start: Date;
  /** When it ends — sunset on its own Gregorian day. */
  end: Date;
  /**
   * False when no location was available and the bounds fell back to local
   * midnight. Callers that must not mislead the user should say so.
   */
  fromSunset: boolean;
}

function previousDay(iso: string): string {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return toIsoDate(d);
}

/**
 * The Gregorian date naming the Hebrew day in effect at `instant`.
 *
 * This is the key to file an event under. After sunset it is the *next*
 * Gregorian date, which is exactly the behaviour an evening event needs.
 * Without a location the calendar day is returned, which is correct until
 * sunset.
 */
export function hebrewDayKeyAt(instant: Date, tzid: string, location?: GeoPoint): string {
  const dayKey = zonedDateKey(instant, tzid);
  if (!location) return dayKey;
  const sunset = zmanimService.sunsetInstant(dayKey, location);
  if (!sunset || instant.getTime() < sunset.getTime()) return dayKey;
  const next = fromIsoDate(dayKey);
  next.setUTCDate(next.getUTCDate() + 1);
  return toIsoDate(next);
}

/**
 * The instants bounding the Hebrew day named by a Gregorian date.
 *
 * Without a location — or at a latitude where the sun does not set on the day
 * in question — this falls back to local midnight and reports `fromSunset:
 * false` rather than inventing a sunset.
 */
export function hebrewDayBounds(
  gregorianIso: string,
  tzid: string,
  location?: GeoPoint,
): HebrewDayBounds {
  const midnight = (iso: string) => zonedDateTimeToUtc(iso, '00:00', tzid);
  if (!location) {
    return {
      start: midnight(gregorianIso),
      end: midnight(nextDay(gregorianIso)),
      fromSunset: false,
    };
  }
  const start = zmanimService.sunsetInstant(previousDay(gregorianIso), location);
  const end = zmanimService.sunsetInstant(gregorianIso, location);
  if (!start || !end) {
    return {
      start: midnight(gregorianIso),
      end: midnight(nextDay(gregorianIso)),
      fromSunset: false,
    };
  }
  return { start, end, fromSunset: true };
}

function nextDay(iso: string): string {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return toIsoDate(d);
}

/**
 * When the Hebrew day named by `gregorianIso` begins — the instant an event
 * described as happening "on the eve of" that date should start from.
 *
 * Returns null when there is no location to compute sunset from, so callers
 * can ask for one rather than silently placing the event at midnight.
 */
export function hebrewDayStart(
  gregorianIso: string,
  tzid: string,
  location?: GeoPoint,
): Date | null {
  const bounds = hebrewDayBounds(gregorianIso, tzid, location);
  return bounds.fromSunset ? bounds.start : null;
}

/**
 * The Gregorian date whose *evening* opens a given Hebrew day — that is, the
 * day before it. Used to label an evening event: "ליל כ״ה בכסלו" happens on
 * the Gregorian evening returned here.
 */
export function eveningOf(gregorianIso: string): string {
  return previousDay(gregorianIso);
}

/**
 * The Hebrew date of a death, given the Gregorian date and whether it
 * occurred after sunset.
 *
 * This is the yahrzeit's defining subtlety: someone who died on the evening
 * of 10 March, after sunset, has a Hebrew date of the 11th, and the yahrzeit
 * is observed a Hebrew day later than the naive conversion suggests. Getting
 * it wrong moves the observance by a day every single year.
 */
export function hebrewDateOfDeath(gregorianIso: string, afterSunset: boolean): HDate {
  const hd = new HDate(fromIsoDate(gregorianIso));
  return afterSunset ? hd.add(1, 'd') : hd;
}
