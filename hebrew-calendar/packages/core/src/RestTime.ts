import { flags, HebrewCalendar, HDate } from '@hebcal/core';
import type { GeoPoint } from './types.js';
import { fromIsoDate } from './dateUtils.js';
import { zonedDateKey } from './timezone.js';
import { zmanimService } from './ZmanimService.js';

/** Why a moment counts as rest time, for display and for logging. */
export type RestReason = 'shabbat' | 'yomtov' | null;

export interface RestWindow {
  /** True when the instant falls inside Shabbat or a festival. */
  isRest: boolean;
  reason: RestReason;
  /** Localized-ish label for the occasion, e.g. "שבת" or the festival name. */
  label: string | null;
  /** When the current rest period ends, if one is in progress. */
  endsAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Candle lighting precedes sunset by this many minutes by default. */
const DEFAULT_CANDLE_MINUTES = 18;

/**
 * The festival falling on a date on which work is forbidden, or null.
 *
 * Decided by hebcal's own CHAG flag rather than by category names or parsing
 * descriptions: Chol HaMoed days are also categorised "holiday, major" and are
 * described as e.g. "Sukkot IV (CH''M)", but work is permitted on them, so a
 * string or category test wrongly classifies them as rest days.
 */
function yomTovLabel(date: Date, il: boolean): string | null {
  const events = HebrewCalendar.getHolidaysOnDate(new HDate(date), il) ?? [];
  for (const ev of events) {
    const mask = ev.getFlags();
    if (mask & flags.CHAG && !(mask & flags.EREV)) return ev.render('he');
  }
  return null;
}

/**
 * Whether a given instant falls within Shabbat or a festival, for a location.
 *
 * The boundaries are the real halachic ones: the period runs from candle
 * lighting on the eve to nightfall (tzeit hakochavim) at the end, not from
 * midnight to midnight. A calendar that knows the zmanim should not fall back
 * on calendar days for this.
 *
 * Without a location the boundaries cannot be computed, so this reports no
 * rest period rather than guessing.
 */
export function restWindowAt(
  instant: Date,
  location: GeoPoint | null | undefined,
  il = false,
  candleMinutes = DEFAULT_CANDLE_MINUTES,
): RestWindow {
  const none: RestWindow = { isRest: false, reason: null, label: null, endsAt: null };
  if (!location) return none;

  // A rest period can have begun the previous evening, so check yesterday too.
  for (const offset of [-1, 0]) {
    const dayKey = zonedDateKey(new Date(instant.getTime() + offset * DAY_MS), location.tzid);
    const day = fromIsoDate(dayKey);
    const next = new Date(day.getTime() + DAY_MS);

    const startsShabbat = day.getDay() === 5; // Friday evening
    const startsYomTov = yomTovLabel(next, il);
    const isShabbatDay = next.getDay() === 6;
    if (!startsShabbat && !startsYomTov) continue;

    const start = zmanimService.candleLightingInstant(dayKey, location, candleMinutes);
    const end = zmanimService.nightfallInstant(zonedDateKey(next, location.tzid), location);
    if (!start || !end) continue;

    if (instant >= start && instant < end) {
      const reason: RestReason = startsYomTov && !isShabbatDay ? 'yomtov' : 'shabbat';
      return {
        isRest: true,
        reason,
        label: reason === 'yomtov' ? startsYomTov : 'שבת',
        endsAt: end,
      };
    }
  }
  return none;
}

/** Convenience wrapper: is it Shabbat or yom tov right now? */
export function isRestTime(location: GeoPoint | null | undefined, il = false, now: Date = new Date()): boolean {
  return restWindowAt(now, location, il).isRest;
}
