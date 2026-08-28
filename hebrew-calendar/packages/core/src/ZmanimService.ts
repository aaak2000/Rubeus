import { GeoLocation, Zmanim } from '@hebcal/core';
import type { GeoPoint } from './types.js';
import { fromIsoDate, formatTimeInTz, isValidDate } from './dateUtils.js';

/** A set of halachic times for one day at one location, as HH:MM wall-clock. */
export interface DailyZmanim {
  date: string;
  tzid: string;
  /** Each value is HH:MM in the location's timezone, or null if not computable. */
  times: Record<string, string | null>;
}

/** The zmanim we surface. Keys are stable; values map to Zmanim methods. */
const ZMAN_METHODS = {
  alotHaShachar: (z: Zmanim) => z.alotHaShachar(),
  misheyakir: (z: Zmanim) => z.misheyakir(),
  sunrise: (z: Zmanim) => z.sunrise(),
  sofZmanShma: (z: Zmanim) => z.sofZmanShma(),
  sofZmanTfilla: (z: Zmanim) => z.sofZmanTfilla(),
  chatzot: (z: Zmanim) => z.chatzot(),
  minchaGedola: (z: Zmanim) => z.minchaGedola(),
  minchaKetana: (z: Zmanim) => z.minchaKetana(),
  plagHaMincha: (z: Zmanim) => z.plagHaMincha(),
  sunset: (z: Zmanim) => z.sunset(),
  tzeit: (z: Zmanim) => z.tzeit(),
  chatzotNight: (z: Zmanim) => z.chatzotNight(),
} as const;

export type ZmanKey = keyof typeof ZMAN_METHODS;

function toGeoLocation(p: GeoPoint): GeoLocation {
  return new GeoLocation(p.name ?? null, p.latitude, p.longitude, p.elevation ?? 0, p.tzid);
}

/**
 * Calculates halachic times (zmanim) for a day and location using the NOAA
 * solar algorithm bundled with `@hebcal/core`.
 */
export class ZmanimService {
  /** All supported zmanim for a Gregorian ISO date at a location. */
  forDate(iso: string, location: GeoPoint, useElevation = false): DailyZmanim {
    const gloc = toGeoLocation(location);
    const zmanim = new Zmanim(gloc, fromIsoDate(iso), useElevation);
    const times: Record<string, string | null> = {};
    for (const key of Object.keys(ZMAN_METHODS) as ZmanKey[]) {
      let value: string | null = null;
      try {
        const d = ZMAN_METHODS[key](zmanim);
        value = isValidDate(d) ? (formatTimeInTz(d, location.tzid) ?? null) : null;
      } catch {
        value = null; // extreme latitudes / polar days may not resolve
      }
      times[key] = value;
    }
    return { date: iso, tzid: location.tzid, times };
  }

  /**
   * Candle-lighting time (default 18 minutes before sunset) for the given day.
   * Returns HH:MM or null.
   */
  candleLighting(iso: string, location: GeoPoint, minutesBefore = 18): string | null {
    const gloc = toGeoLocation(location);
    const zmanim = new Zmanim(gloc, fromIsoDate(iso), false);
    const d = zmanim.sunsetOffset(-minutesBefore, true);
    return isValidDate(d) ? (formatTimeInTz(d, location.tzid) ?? null) : null;
  }
}

export const zmanimService = new ZmanimService();
