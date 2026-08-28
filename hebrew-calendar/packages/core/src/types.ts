/** Shared domain types for the Hebrew calendar core. */

/** A geographic point used for zmanim (halachic time) calculations. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  /** IANA timezone id, e.g. "Asia/Jerusalem". */
  tzid: string;
  /** Elevation in meters (default 0). */
  elevation?: number;
  /** Whether the location is in Israel (affects holiday scheme). Default false. */
  il?: boolean;
  /** Optional display name. */
  name?: string;
}

/** A plain, serializable Hebrew date (month: 1=Nisan .. 7=Tishrei .. 13=Adar II). */
export interface HebrewDate {
  year: number;
  month: number;
  day: number;
  monthName: string;
}

/** A Hebrew date paired with its Gregorian equivalent and Hebrew rendering. */
export interface DateConversion {
  gregorian: string; // ISO date (YYYY-MM-DD)
  hebrew: HebrewDate;
  /** Rendered Hebrew string with gematriya, e.g. "ט״ו בְּחֶשְׁוָן תשס״ט". */
  hebrewText: string;
}

/** A calendar item derived from the Hebrew calendar (holiday, parasha, omer, etc.). */
export interface CalendarItem {
  /** ISO date (YYYY-MM-DD) the item falls on. */
  date: string;
  /** Machine-readable description (stable English key). */
  desc: string;
  /** Localized title. */
  title: string;
  /** Hebrew title. */
  titleHe: string;
  categories: string[];
  emoji?: string;
  /** For timed events (candle lighting, havdalah), the wall-clock time HH:MM. */
  time?: string;
}

/** The kind of Hebrew-date recurrence. */
export type HebrewRecurrenceKind = 'yahrzeit' | 'birthday' | 'anniversary';
