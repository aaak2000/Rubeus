import { hebrewDateService, holidayService, zmanimService, type CalendarItem, type GeoPoint } from '@hcal/core';

/** One day in the visible month grid. */
export interface GridDay {
  iso: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
  hebrewDay: string; // gematriya day-of-month, e.g. "ט״ו"
  hebrewMonth: string;
  holidays: CalendarItem[];
}

const WEEK_START = 0; // Sunday

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build a 6-week grid for the given Gregorian year/month (month is 1-12). */
export function buildMonthGrid(year: number, month: number, il: boolean): GridDay[] {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() - WEEK_START + 7) % 7));
  const todayIso = iso(new Date());

  // Holidays for the whole visible window in one call (offline via @hcal/core).
  const last = new Date(start);
  last.setDate(start.getDate() + 41);
  const items = holidayService.between(iso(start), iso(last), { il, locale: 'he', sedrot: true, omer: true });
  const byDate = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const arr = byDate.get(it.date) ?? [];
    arr.push(it);
    byDate.set(it.date, arr);
  }

  const days: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayIso = iso(d);
    const conv = hebrewDateService.fromGregorian(dayIso);
    // renderGematriya() => "ט״ו חֶשְׁוָן תשס״ט"; take the day token.
    const dayToken = conv.hebrewText.split(' ')[0] ?? String(conv.hebrew.day);
    days.push({
      iso: dayIso,
      inMonth: d.getMonth() === month - 1,
      isToday: dayIso === todayIso,
      hebrewDay: dayToken,
      hebrewMonth: conv.hebrew.monthName,
      holidays: byDate.get(dayIso) ?? [],
    });
  }
  return days;
}

export function zmanimFor(dateIso: string, geo: GeoPoint) {
  return zmanimService.forDate(dateIso, geo);
}

export const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
