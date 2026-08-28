/** Small date helpers shared across services. */

/** Format a JS Date as a local ISO date string (YYYY-MM-DD), timezone-naive. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a local Date (at midnight). */
export function fromIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** True when a Date object is valid. */
export function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Format an instant as HH:MM wall-clock time in a given IANA timezone.
 * Returns undefined for invalid dates.
 */
export function formatTimeInTz(d: Date, tzid: string): string | undefined {
  if (!isValidDate(d)) return undefined;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tzid,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
