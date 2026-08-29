import { BadRequestException, Injectable } from '@nestjs/common';
import type { Event as DbEvent } from '@prisma/client';
import {
  gregorianRecurrence,
  hebrewDateService,
  hebrewRecurrence,
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
  /** True when this row is a generated occurrence of a Hebrew recurrence. */
  isOccurrence: boolean;
  hebrew: { text: string; monthName: string; day: number; year: number };
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendars: CalendarsService,
  ) {}

  private annotate(iso: string): EventInstance['hebrew'] {
    const c = hebrewDateService.fromGregorian(iso.slice(0, 10));
    return { text: c.hebrewText, monthName: c.hebrew.monthName, day: c.hebrew.day, year: c.hebrew.year };
  }

  private toInstance(e: DbEvent, over: Partial<EventInstance> = {}): EventInstance {
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
      hebrew: this.annotate(start),
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
   * Non-recurring events are returned if they overlap the range; Hebrew
   * recurrences are expanded into all-day occurrences within the range.
   */
  async listRange(userId: string, calendarId: string, startIso: string, endIso: string): Promise<EventInstance[]> {
    await this.calendars.ensureOwned(userId, calendarId);
    const start = new Date(startIso);
    const end = new Date(endIso);
    const events = await this.prisma.event.findMany({ where: { calendarId } });
    const out: EventInstance[] = [];

    for (const e of events) {
      if (e.hebrewRecurrence && e.hebrewRecurrenceDate) {
        const spec: HebrewRecurrenceSpec = {
          kind: e.hebrewRecurrence,
          originalGregorian: e.hebrewRecurrenceDate.toISOString().slice(0, 10),
        };
        const occurrences = hebrewRecurrence.occurrencesBetween(spec, startIso.slice(0, 10), endIso.slice(0, 10));
        for (const occ of occurrences) {
          const dayStart = `${occ.gregorian}T00:00:00.000Z`;
          const dayEnd = `${occ.gregorian}T23:59:59.000Z`;
          out.push(this.toInstance(e, { start: dayStart, end: dayEnd, allDay: true, isOccurrence: true }));
        }
      } else if (e.rrule) {
        // Standard iCalendar recurrence: expand into concrete occurrences,
        // preserving each occurrence's duration.
        const durationMs = e.endUtc.getTime() - e.startUtc.getTime();
        const starts = gregorianRecurrence.occurrencesBetween(e.rrule, e.startUtc, startIso.slice(0, 10), endIso.slice(0, 10));
        for (const occStart of starts) {
          const occEnd = new Date(occStart.getTime() + durationMs);
          out.push(
            this.toInstance(e, { start: occStart.toISOString(), end: occEnd.toISOString(), isOccurrence: true }),
          );
        }
      } else {
        // Single event: include if it overlaps the queried window.
        if (e.startUtc <= end && e.endUtc >= start) out.push(this.toInstance(e));
      }
    }
    out.sort((a, b) => a.start.localeCompare(b.start));
    return out;
  }
}
