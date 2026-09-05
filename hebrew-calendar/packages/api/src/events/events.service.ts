import {
  type GeoPoint,
  gregorianRecurrence,
  type HebrewRecurrenceSpec,
  hebrewDateService,
  hebrewDayKeyAt,
  hebrewRecurrence,
  zonedDateKey,
  zonedDateTimeToUtc,
} from '@hcal/core';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Event as DbEvent } from '@prisma/client';
import { CalendarsService } from '../calendars/calendars.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto, UpdateEventDto } from './dto';

/** A concrete event occurrence returned to clients, annotated with its Hebrew date. */
export interface EventInstance {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  rrule: string | null;
  hebrewRecurrence: string | null;
  /** True when this row is a generated occurrence of a recurrence. */
  isOccurrence: boolean;
  /** The civil calendar day this occurrence falls on in the user's timezone (YYYY-MM-DD). */
  localDate: string;
  /**
   * The day this occurrence belongs to on the Hebrew calendar, named by the
   * Gregorian date of its daytime half. After sunset this is the day *after*
   * `localDate`: the Hebrew day has already turned.
   */
  hebrewDay: string;
  /** True when the two disagree — the event falls in the evening. */
  isEvening: boolean;
  hebrew: { text: string; monthName: string; day: number; year: number };
}

/** The user context every annotation needs. */
interface UserContext {
  tzid: string;
  /** Null when the user has not set a location; sunset is then unknown. */
  location: GeoPoint | null;
  dayBoundary: 'midnight' | 'sunset';
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendars: CalendarsService,
  ) {}

  /**
   * The Hebrew date an instant falls on, resolved in the user's timezone and
   * — when a location is known — at the sunset that actually turns the Hebrew
   * day. Slicing the UTC string here would file late-evening events under the
   * previous day; ignoring sunset would file them under the previous *Hebrew*
   * day, which for a Hebrew calendar is the more visible error.
   */
  private annotate(hebrewDayKey: string): EventInstance['hebrew'] {
    const c = hebrewDateService.fromGregorian(hebrewDayKey);
    return {
      text: c.hebrewText,
      monthName: c.hebrew.monthName,
      day: c.hebrew.day,
      year: c.hebrew.year,
    };
  }

  /** The user's timezone, location and day-boundary preference. */
  private async contextOf(userId: string): Promise<UserContext> {
    const s = await this.prisma.userSettings.findUnique({ where: { userId } });
    const tzid = s?.tzid || 'Asia/Jerusalem';
    const location =
      s && s.latitude !== null && s.longitude !== null
        ? {
            latitude: s.latitude,
            longitude: s.longitude,
            tzid,
            elevation: s.elevation ?? 0,
            il: s.il,
          }
        : null;
    return { tzid, location, dayBoundary: s?.dayBoundary ?? 'sunset' };
  }

  private toInstance(
    e: DbEvent,
    ctx: UserContext,
    over: Partial<EventInstance> = {},
  ): EventInstance {
    const start = over.start ?? e.startUtc.toISOString();
    const localDate = zonedDateKey(new Date(start), ctx.tzid);
    // An all-day occurrence is a date, not an instant: it has no evening half,
    // so it stays on its own day whatever the sun is doing.
    const allDay = over.allDay ?? e.allDay;
    const hebrewDay = allDay
      ? localDate
      : hebrewDayKeyAt(new Date(start), ctx.tzid, ctx.location ?? undefined);
    return {
      id: e.id,
      calendarId: e.calendarId,
      title: e.title,
      description: e.description,
      location: e.location,
      start,
      end: over.end ?? e.endUtc.toISOString(),
      allDay,
      rrule: e.rrule,
      hebrewRecurrence: e.hebrewRecurrence,
      isOccurrence: over.isOccurrence ?? false,
      localDate,
      hebrewDay,
      isEvening: hebrewDay !== localDate,
      hebrew: this.annotate(hebrewDay),
    };
  }

  async create(userId: string, calendarId: string, dto: CreateEventDto): Promise<DbEvent> {
    await this.calendars.ensureOwned(userId, calendarId);
    if (dto.hebrewRecurrence && !dto.hebrewRecurrenceDate) {
      throw new BadRequestException('hebrewRecurrenceDate is required with hebrewRecurrence');
    }
    return this.prisma.event.create({
      data: {
        calendarId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startUtc: new Date(dto.start),
        endUtc: new Date(dto.end),
        allDay: dto.allDay ?? false,
        rrule: dto.rrule,
        hebrewRecurrence: dto.hebrewRecurrence,
        hebrewRecurrenceDate: dto.hebrewRecurrenceDate ? new Date(dto.hebrewRecurrenceDate) : null,
      },
    });
  }

  async update(
    userId: string,
    calendarId: string,
    id: string,
    dto: UpdateEventDto,
  ): Promise<DbEvent> {
    await this.calendars.ensureOwned(userId, calendarId);
    return this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startUtc: dto.start ? new Date(dto.start) : undefined,
        endUtc: dto.end ? new Date(dto.end) : undefined,
        allDay: dto.allDay,
        rrule: dto.rrule,
        hebrewRecurrence: dto.hebrewRecurrence,
        // A field left out of the body means "unchanged"; one sent as null
        // means "clear it". Collapsing the two — as `x ? new Date(x) :
        // undefined` did — left the anchor date behind when an event was
        // switched off Hebrew recurrence, and made it unclearable at all.
        hebrewRecurrenceDate: nullableDate(dto.hebrewRecurrenceDate),
      },
    });
  }

  async remove(userId: string, calendarId: string, id: string) {
    await this.calendars.ensureOwned(userId, calendarId);
    await this.prisma.event.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * List concrete event occurrences intersecting [startIso, endIso].
   *
   * Single events are returned when they overlap the window; Hebrew and
   * Gregorian recurrences are expanded into concrete occurrences. Every
   * instance is annotated with the local day and Hebrew date resolved in the
   * user's timezone.
   */
  async listRange(
    userId: string,
    calendarId: string,
    startIso: string,
    endIso: string,
  ): Promise<EventInstance[]> {
    await this.calendars.ensureOwned(userId, calendarId);
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('start and end must be valid ISO instants');
    }
    if (end < start) throw new BadRequestException('end must not precede start');
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Requested range is too large (maximum 3 years)');
    }

    const ctx = await this.contextOf(userId);
    const tzid = ctx.tzid;
    // Widen the scan by a day on each side so an event whose local day falls
    // inside the window is not dropped because its UTC instant sits just
    // outside it — a 01:30 Jerusalem event is 22:30Z on the previous date,
    // and an evening event belongs to the *next* Hebrew day. The day filter
    // below trims the surplus back off.
    const scanStart = new Date(start.getTime() - DAY_MS);
    const scanEnd = new Date(end.getTime() + DAY_MS);
    const scanFrom = zonedDateKey(scanStart, tzid);
    const scanTo = zonedDateKey(scanEnd, tzid);

    const events = await this.prisma.event.findMany({ where: { calendarId } });
    const out: EventInstance[] = [];

    for (const e of events) {
      if (e.hebrewRecurrence && e.hebrewRecurrenceDate) {
        const spec: HebrewRecurrenceSpec = {
          kind: e.hebrewRecurrence,
          originalGregorian: dateOnlyKey(e.hebrewRecurrenceDate),
        };
        for (const occ of hebrewRecurrence.occurrencesBetween(spec, scanFrom, scanTo)) {
          // A Hebrew anniversary is an all-day event on its local calendar day.
          const dayStart = zonedDateTimeToUtc(occ.gregorian, '00:00', tzid);
          const dayEnd = new Date(dayStart.getTime() + DAY_MS - 1000);
          out.push(
            this.toInstance(e, ctx, {
              start: dayStart.toISOString(),
              end: dayEnd.toISOString(),
              allDay: true,
              isOccurrence: true,
            }),
          );
        }
      } else if (e.rrule) {
        const durationMs = e.endUtc.getTime() - e.startUtc.getTime();
        for (const occStart of gregorianRecurrence.occurrencesBetween(
          e.rrule,
          e.startUtc,
          scanFrom,
          scanTo,
        )) {
          const occEnd = new Date(occStart.getTime() + durationMs);
          out.push(
            this.toInstance(e, ctx, {
              start: occStart.toISOString(),
              end: occEnd.toISOString(),
              isOccurrence: true,
            }),
          );
        }
      } else if (e.startUtc <= scanEnd && e.endUtc >= scanStart) {
        out.push(this.toInstance(e, ctx));
      }
    }

    // Keep only instances whose day lies within the requested window, using
    // the same day scheme the user reads the calendar in: filtering an evening
    // event by its civil date would drop it from the Hebrew day it is filed
    // under.
    const fromKey = zonedDateKey(start, tzid);
    const toKey = zonedDateKey(end, tzid);
    const dayOf = (i: EventInstance) => (ctx.dayBoundary === 'sunset' ? i.hebrewDay : i.localDate);
    return out
      .filter((i) => dayOf(i) >= fromKey && dayOf(i) <= toKey)
      .sort((a, b) => a.start.localeCompare(b.start));
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Guard against unbounded recurrence expansion from a hostile range query. */
const MAX_RANGE_MS = 3 * 366 * DAY_MS;

/**
 * Read a date-only column as `YYYY-MM-DD` using its UTC components. Prisma
 * returns it at UTC midnight, so local formatting could shift it a day.
 */
function dateOnlyKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** undefined stays undefined (leave it alone); null clears; a string parses. */
function nullableDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}
