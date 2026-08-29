/**
 * Timezone conversion between UTC instants and wall-clock time in an IANA
 * timezone, built on `Intl.DateTimeFormat` (no external dependency).
 *
 * The system stores every event as a UTC instant; a user's `tzid` is the
 * context in which those instants are written and read. Getting this wrong
 * shifts events by hours and files them under the wrong day, so all
 * conversions funnel through this module.
 */

/** Wall-clock components of an instant as observed in a timezone. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tzid: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(tzid);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(tzid, fmt);
  }
  return fmt;
}

/** True when `tzid` is a timezone this runtime recognizes. */
export function isValidTimeZone(tzid: string): boolean {
  try {
    formatterFor(tzid).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock components of `instant` as observed in `tzid`. */
export function utcToZonedParts(instant: Date, tzid: string): ZonedParts {
  const parts = formatterFor(tzid).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // h23 renders midnight as 24 in some engines
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * The timezone's UTC offset, in milliseconds, in effect at `instant`.
 * Positive east of Greenwich (Asia/Jerusalem in summer => +3h).
 */
export function zoneOffsetMs(instant: Date, tzid: string): number {
  const p = utcToZonedParts(instant, tzid);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Second-level precision is enough; strip sub-second noise from the instant.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which the given wall-clock time occurs in `tzid`.
 *
 * Resolved iteratively so daylight-saving transitions are handled: the first
 * guess uses the offset at the naive instant, then re-checks the offset at the
 * candidate result and corrects it.
 *
 * Edge cases inherent to civil time:
 * - A time skipped by a spring-forward transition does not exist; the result
 *   lands on the instant just after the gap.
 * - A time repeated by a fall-back transition is ambiguous; the earlier
 *   (pre-transition) occurrence is returned.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  tzid = 'UTC',
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = zoneOffsetMs(new Date(naive), tzid);
  let ts = naive - firstOffset;
  const secondOffset = zoneOffsetMs(new Date(ts), tzid);
  if (secondOffset !== firstOffset) ts = naive - secondOffset;
  return new Date(ts);
}

/** Parse `YYYY-MM-DD` plus optional `HH:MM` into a UTC instant in `tzid`. */
export function zonedDateTimeToUtc(dateIso: string, time: string | undefined, tzid: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!d) throw new Error(`Invalid date: ${dateIso}`);
  let hour = 0;
  let minute = 0;
  if (time) {
    const t = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!t) throw new Error(`Invalid time: ${time}`);
    hour = Number(t[1]);
    minute = Number(t[2]);
  }
  return zonedWallTimeToUtc(Number(d[1]), Number(d[2]), Number(d[3]), hour, minute, 0, tzid);
}

/**
 * The calendar day an instant falls on in `tzid`, as `YYYY-MM-DD`.
 * This is the key events must be grouped by — grouping by the UTC date files
 * late-evening and early-morning events under the wrong day.
 */
export function zonedDateKey(instant: Date, tzid: string): string {
  const p = utcToZonedParts(instant, tzid);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The wall-clock time of an instant in `tzid`, as `HH:MM`. */
export function zonedTimeKey(instant: Date, tzid: string): string {
  const p = utcToZonedParts(instant, tzid);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** The viewer's own timezone, for use as a sensible default. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
