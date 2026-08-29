import { BadRequestException, Injectable } from '@nestjs/common';
import type { Event as DbEvent } from '@prisma/client';
import {
  gregorianRecurrence,
  hebrewDateService,
  hebrewRecurrence,
  zonedDateKey,
  zonedDateTimeToUtc,
  type HebrewRecurrenceSpec,
} from '@hcal/core';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarsService } from '../calendars/calendars.service';
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
  /** The calendar day this occurrence falls on in the user's timezone (YYYY-MM-DD). */
  localDate: string;
  hebrew: { text: string; monthName: string; day: number; year: number };
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendars: CalendarsService,
  ) {}

  /**
   * The Hebrew date an instant falls on, resolved in the user's timezone.
   * Slicing the UTC string here would file late-evening events under the
   * previous day.
   */
  private annotate(instantIso: string, tzid: string): EventInstance['hebrew'] {
    const c = hebrewDateService.fromGregorian(zonedDateKey(new Date(instantIso), tzid));
    return { text: c.hebrewText, monthName: c.hebrew.monthName, day: c.hebrew.day, year: c.hebrew.year };
  }

  /** The user's configured timezone, defaulting to Israel time. */
  private async timezoneOf(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    return settings?.tzid || 'Asia/Jerusalem';
  }

  private toInstance(e: DbEvent, tzid: string, over: Partial<EventInstance> = {}): EventInstance {
    const start = over.start ?? e.startUtc.toISOString();
    return {
      id: e.id,
      calendarId: e.calendarId,
      title: e.title,
      description: e.description,
      location: e.location,
      start,
      end: over.end ?? e.endUtc.toISOString(),
      allDay: over.allDay ?? e.allDay,
      rrule: e.rrule,
      hebrewRecurrence: e.hebrewRecurrence,
      isOccurrence: over.isOccurrence ?? false,
      localDate: zonedDateKey(new Date(start), tzid),
      hebrew: this.annotate(start, tzid),
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

  async update(userId: string, calendarId: string, id: string, dto: UpdateEventDto): Promise<DbEvent> {
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
        hebrewRecurrenceDate: dto.hebrewRecurrenceDate ? new Date(dto.hebrewRecurrenceDate) : undefined,
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
  async listRange(userId: string, calendarId: string, startIso: string, endIso: string): Promise<EventInstance[]> {
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

    const tzid = await this.timezoneOf(userId);
    // Widen the scan by a day on each side so an event whose local day falls
    // inside the window is not dropped because its UTC instant sits just
    // outside it — a 01:30 Jerusalem event is 22:30Z on the previous date.
    // The localDate filter below trims the surplus back off.
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
            this.toInstance(e, tzid, {
              start: dayStart.toISOString(),
              end: dayEnd.toISOString(),
              allDay: true,
              isOccurrence: true,
            }),
          );
        }
      } else if (e.rrule) {
        const durationMs = e.endUtc.getTime() - e.startUtc.getTime();
        for (const occStart of gregorianRecurrence.occurrencesBetween(e.rrule, e.startUtc, scanFrom, scanTo)) {
          const occEnd = new Date(occStart.getTime() + durationMs);
          out.push(
            this.toInstance(e, tzid, {
              start: occStart.toISOString(),
              end: occEnd.toISOString(),
              isOccurrence: true,
            }),
          );
        }
      } else if (e.startUtc <= scanEnd && e.endUtc >= scanStart) {
        out.push(this.toInstance(e, tzid));
      }
    }

    // Keep only instances whose local day lies within the requested window.
    const fromKey = zonedDateKey(start, tzid);
    const toKey = zonedDateKey(end, tzid);
    return out
      .filter((i) => i.localDate >= fromKey && i.localDate <= toKey)
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
