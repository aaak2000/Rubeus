import { Event, HDate, HebrewCalendar, Location, Molad } from '@hebcal/core';
import type { CalendarItem, GeoPoint } from './types.js';
import { fromIsoDate, formatTimeInTz, toIsoDate } from './dateUtils.js';

export interface HolidayQueryOptions {
  /** Use the Israel holiday scheme (one-day yom tov). Default false (diaspora). */
  il?: boolean;
  /** Include weekly Torah portion (parashat hashavua). Default true. */
  sedrot?: boolean;
  /** Include Rosh Chodesh. Default true. */
  roshChodesh?: boolean;
  /** Include the Omer count. Default true. */
  omer?: boolean;
  /** Include modern Israeli holidays (Yom Ha'atzmaut, etc.). Default true. */
  modern?: boolean;
  /** If set, include candle-lighting / havdalah times for this location. */
  location?: GeoPoint;
  /** Locale for localized titles (default 'en'; Hebrew is always provided). */
  locale?: string;
}

function toLocation(p: GeoPoint): Location {
  return new Location(
    p.latitude,
    p.longitude,
    p.il ?? false,
    p.tzid,
    p.name,
    undefined,
    undefined,
    p.elevation ?? 0,
  );
}

/**
 * Produces Hebrew-calendar items — holidays, festivals, Rosh Chodesh, the
 * weekly Torah portion, the Omer count, candle-lighting/havdalah times, and
 * the monthly molad — over a date range. Wraps `@hebcal/core`'s
 * `HebrewCalendar.calendar`.
 */
export class HolidayService {
  /** Calendar items between two Gregorian ISO dates (inclusive). */
  between(startIso: string, endIso: string, opts: HolidayQueryOptions = {}): CalendarItem[] {
    const location = opts.location ? toLocation(opts.location) : undefined;
    const events = HebrewCalendar.calendar({
      start: fromIsoDate(startIso),
      end: fromIsoDate(endIso),
      il: opts.il ?? false,
      sedrot: opts.sedrot ?? true,
      noRoshChodesh: opts.roshChodesh === false,
      omer: opts.omer ?? true,
      noModern: opts.modern === false,
      candlelighting: Boolean(location),
      location,
      locale: opts.locale ?? 'en',
    });

    return events.map((ev: Event) => {
      const time = (ev as { eventTime?: Date }).eventTime;
      const item: CalendarItem = {
        date: toIsoDate(ev.getDate().greg()),
        desc: ev.getDesc(),
        title: ev.render(opts.locale ?? 'en'),
        titleHe: ev.render('he'),
        categories: ev.getCategories(),
      };
      const emoji = ev.getEmoji();
      if (emoji) item.emoji = emoji;
      if (time && location) {
        const t = formatTimeInTz(time, opts.location!.tzid);
        if (t) item.time = t;
      }
      return item;
    });
  }

  /** Calendar items for a whole Gregorian month (year, month 1-12). */
  forGregorianMonth(year: number, month: number, opts: HolidayQueryOptions = {}): CalendarItem[] {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return this.between(toIsoDate(start), toIsoDate(end), opts);
  }

  /** Holidays occurring on a single Gregorian ISO date. */
  onDate(iso: string, il = false): CalendarItem[] {
    const events = HebrewCalendar.getHolidaysOnDate(new HDate(fromIsoDate(iso)), il) ?? [];
    return events.map((ev: Event) => {
      const item: CalendarItem = {
        date: iso,
        desc: ev.getDesc(),
        title: ev.render('en'),
        titleHe: ev.render('he'),
        categories: ev.getCategories(),
      };
      const emoji = ev.getEmoji();
      if (emoji) item.emoji = emoji;
      return item;
    });
  }

  /**
   * The molad (mean lunar conjunction) announcement for a Hebrew month.
   * @param hebrewYear Hebrew year
   * @param month Hebrew month (1=Nisan .. 7=Tishrei)
   */
  molad(hebrewYear: number, month: number): {
    monthName: string;
    dayOfWeek: number;
    hour: number;
    minutes: number;
    chalakim: number;
  } {
    const m = new Molad(hebrewYear, month);
    return {
      monthName: m.getMonthName(),
      dayOfWeek: m.getDow(),
      hour: m.getHour(),
      minutes: m.getMinutes(),
      chalakim: m.getChalakim(),
    };
  }
}

export const holidayService = new HolidayService();
