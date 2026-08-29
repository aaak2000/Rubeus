import {
  gematriya,
  hebrewDateService,
  holidayService,
  zmanimService,
  zonedDateKey,
  type CalendarItem,
  type GeoPoint,
} from '@hcal/core';

/** Hebrew month names, indexed by hebcal's month numbers (1 = Nisan). */
const MONTH_NAMES_HE: Record<number, string> = {
  1: 'ניסן',
  2: 'אייר',
  3: 'סיוון',
  4: 'תמוז',
  5: 'אב',
  6: 'אלול',
  7: 'תשרי',
  8: 'חשוון',
  9: 'כסלו',
  10: 'טבת',
  11: 'שבט',
  12: 'אדר',
  13: 'אדר ב׳',
};

/** The Hebrew name of a month, distinguishing Adar I/II in a leap year. */
export function hebrewMonthName(month: number, year: number): string {
  if (month === 12 && hebrewDateService.isLeapYear(year)) return 'אדר א׳';
  return MONTH_NAMES_HE[month] ?? '';
}

/** A Hebrew year in gematriya, e.g. 5786 → "תשפ״ו". */
export function hebrewYearText(year: number): string {
  return gematriya(year);
}

/** A day of the Hebrew month in gematriya, e.g. 15 → "ט״ו". */
export function hebrewDayText(day: number): string {
  return gematriya(day);
}

export const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const HEBREW_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const GREGORIAN_MONTHS_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/**
 * Halachic times, in Hebrew, with a one-line explanation of each.
 * The API returns stable English keys; users should never see them.
 */
export const ZMAN_LABELS: Record<string, { label: string; description: string }> = {
  alotHaShachar: { label: 'עלות השחר', description: 'תחילת היום ההלכתי, עם האור הראשון' },
  misheyakir: { label: 'משיכיר', description: 'הזמן המוקדם ביותר לטלית ותפילין' },
  sunrise: { label: 'הנץ החמה', description: 'זריחת השמש; זמן תפילת ותיקין' },
  sofZmanShma: { label: 'סוף זמן ק״ש', description: 'סוף הזמן לקריאת שמע של שחרית' },
  sofZmanTfilla: { label: 'סוף זמן תפילה', description: 'סוף הזמן לתפילת שחרית' },
  chatzot: { label: 'חצות היום', description: 'אמצע היום ההלכתי' },
  minchaGedola: { label: 'מנחה גדולה', description: 'תחילת הזמן לתפילת מנחה' },
  minchaKetana: { label: 'מנחה קטנה', description: 'הזמן המועדף לתפילת מנחה' },
  plagHaMincha: { label: 'פלג המנחה', description: 'הזמן המוקדם ביותר לקבלת שבת' },
  sunset: { label: 'שקיעה', description: 'סוף היום; כאן מתחיל התאריך העברי הבא' },
  tzeit: { label: 'צאת הכוכבים', description: 'לילה ודאי; צאת שבת וחג' },
  chatzotNight: { label: 'חצות הלילה', description: 'אמצע הלילה ההלכתי' },
};

/** The order zmanim are presented in — chronological through the day. */
export const ZMAN_ORDER = [
  'alotHaShachar',
  'misheyakir',
  'sunrise',
  'sofZmanShma',
  'sofZmanTfilla',
  'chatzot',
  'minchaGedola',
  'minchaKetana',
  'plagHaMincha',
  'sunset',
  'tzeit',
  'chatzotNight',
];

/** One day in a rendered calendar grid. */
export interface GridDay {
  iso: string; // YYYY-MM-DD
  dayOfMonth: number;
  weekday: number; // 0 = Sunday
  inMonth: boolean;
  isToday: boolean;
  isShabbat: boolean;
  /** True when a yom tov falls on this day (rendered like Shabbat). */
  isYomTov: boolean;
  hebrewDay: string;
  hebrewMonth: string;
  hebrewYear: number;
  hebrewMonthNum: number;
  holidays: CalendarItem[];
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * hebcal renders Hebrew years as Latin digits ("ראש השנה 5787"). In a Hebrew
 * calendar the year belongs in gematriya, so rewrite any standalone four-digit
 * year in the 5000s that appears in a title.
 */
function withGematriyaYear(title: string): string {
  return title.replace(/\b(5\d{3})\b/g, (_, year: string) => gematriya(Number(year)));
}

/** Holidays for a window, grouped by ISO date. One core call for the range. */
function holidaysByDate(startIso: string, endIso: string, il: boolean): Map<string, CalendarItem[]> {
  const items = holidayService.between(startIso, endIso, { il, locale: 'he', sedrot: true, omer: true });
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const arr = map.get(item.date) ?? [];
    arr.push({ ...item, titleHe: withGematriyaYear(item.titleHe) });
    map.set(item.date, arr);
  }
  return map;
}

/** True when the day's items include a full festival (work-prohibited). */
function hasYomTov(items: CalendarItem[]): boolean {
  return items.some((i) => i.categories.includes('holiday') && i.categories.includes('major'));
}

function buildDays(dates: Date[], monthFilter: number | null, il: boolean, tzid: string): GridDay[] {
  if (dates.length === 0) return [];
  const byDate = holidaysByDate(isoOf(dates[0]!), isoOf(dates[dates.length - 1]!), il);
  const todayIso = zonedDateKey(new Date(), tzid);

  return dates.map((d) => {
    const iso = isoOf(d);
    const conv = hebrewDateService.fromGregorian(iso);
    const items = byDate.get(iso) ?? [];
    return {
      iso,
      dayOfMonth: d.getDate(),
      weekday: d.getDay(),
      inMonth: monthFilter === null || d.getMonth() === monthFilter,
      isToday: iso === todayIso,
      isShabbat: d.getDay() === 6,
      isYomTov: hasYomTov(items),
      hebrewDay: hebrewDayText(conv.hebrew.day),
      hebrewMonth: hebrewMonthName(conv.hebrew.month, conv.hebrew.year),
      hebrewYear: conv.hebrew.year,
      hebrewMonthNum: conv.hebrew.month,
      holidays: items,
    };
  });
}

/** A six-week grid covering the given Gregorian month (month is 1-12). */
export function buildMonthGrid(year: number, month: number, il: boolean, tzid: string): GridDay[] {
  const first = new Date(year, month - 1, 1);
  const start = addDays(first, -first.getDay()); // back to Sunday
  const dates = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return buildDays(dates, month - 1, il, tzid);
}

/** The seven days of the week containing `anchorIso`. */
export function buildWeek(anchorIso: string, il: boolean, tzid: string): GridDay[] {
  const anchor = new Date(`${anchorIso}T00:00:00`);
  const start = addDays(anchor, -anchor.getDay());
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return buildDays(dates, null, il, tzid);
}

/** A rolling window of days starting at `startIso`, for the agenda view. */
export function buildRange(startIso: string, days: number, il: boolean, tzid: string): GridDay[] {
  const start = new Date(`${startIso}T00:00:00`);
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  return buildDays(dates, null, il, tzid);
}

/** The Gregorian span a Hebrew month covers, for the Hebrew year view. */
export function hebrewMonthSpan(hebrewYear: number, hebrewMonth: number): { startIso: string; days: number } {
  const start = hebrewDateService.fromHebrew(hebrewYear, hebrewMonth, 1);
  return { startIso: start.gregorian, days: hebrewDateService.daysInMonth(hebrewMonth, hebrewYear) };
}

/**
 * The Hebrew month(s) a Gregorian grid spans, rendered for the header —
 * e.g. "אלול תשפ״ו" or "אב–אלול תשפ״ו".
 */
export function hebrewRangeLabel(days: GridDay[]): string {
  const inMonth = days.filter((d) => d.inMonth);
  if (inMonth.length === 0) return '';
  const first = inMonth[0]!;
  const last = inMonth[inMonth.length - 1]!;
  const yearText = hebrewYearText(last.hebrewYear);
  if (first.hebrewMonthNum === last.hebrewMonthNum) return `${first.hebrewMonth} ${yearText}`;
  if (first.hebrewYear !== last.hebrewYear) {
    return `${first.hebrewMonth} ${hebrewYearText(first.hebrewYear)} – ${last.hebrewMonth} ${yearText}`;
  }
  return `${first.hebrewMonth}–${last.hebrewMonth} ${yearText}`;
}

export function zmanimFor(dateIso: string, geo: GeoPoint) {
  return zmanimService.forDate(dateIso, geo);
}

/** The Hebrew date right now, accounting for the sunset boundary. */
export function hebrewToday(tzid: string, location?: GeoPoint) {
  return hebrewDateService.at(new Date(), tzid, location);
}
