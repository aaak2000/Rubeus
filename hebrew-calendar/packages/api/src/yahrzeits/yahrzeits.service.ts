import {
  type GeoPoint,
  gematriya,
  hebrewDateOfDeath,
  hebrewDateService,
  hebrewRecurrence,
  zmanimService,
  zonedDateKey,
} from '@hcal/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Yahrzeit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateYahrzeitDto, UpdateYahrzeitDto } from './dto';

/** A yahrzeit with its next occurrence worked out. */
export interface YahrzeitView {
  id: string;
  name: string;
  hebrewName: string | null;
  relation: string | null;
  /** Gregorian date of death, `YYYY-MM-DD`. */
  deathDate: string;
  afterSunset: boolean;
  note: string | null;
  remindDaysBefore: number[];
  /** The Hebrew date the yahrzeit falls on, e.g. "י״ז בתמוז". */
  hebrewDateText: string;
  /** The next occurrence, or null if it cannot be computed. */
  next: {
    /** Gregorian date of the yahrzeit day itself. */
    gregorian: string;
    hebrewText: string;
    /** Hebrew year of this occurrence, in gematriya. */
    hebrewYearText: string;
    hebrewYear: number;
    /** Whole days from today until it. Negative never occurs — we look forward. */
    daysUntil: number;
    /**
     * When the memorial candle is lit: nightfall the evening before, since
     * the Hebrew day — and so the yahrzeit — begins then. Null without a
     * location.
     */
    candleAt: string | null;
    /** Gregorian date of that evening. */
    candleDate: string;
  } | null;
}

@Injectable()
export class YahrzeitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async contextOf(userId: string): Promise<{ tzid: string; location: GeoPoint | null }> {
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
    return { tzid, location };
  }

  /** Read a date-only column as `YYYY-MM-DD` from its UTC parts. */
  private dateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  async list(userId: string, now = new Date()): Promise<YahrzeitView[]> {
    const { tzid, location } = await this.contextOf(userId);
    const rows = await this.prisma.yahrzeit.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    const views = rows.map((r) => this.toView(r, tzid, location, now));
    // Soonest first: this list exists to answer "what is coming up".
    return views.sort((a, b) => {
      if (!a.next) return 1;
      if (!b.next) return -1;
      return a.next.daysUntil - b.next.daysUntil;
    });
  }

  async create(userId: string, dto: CreateYahrzeitDto): Promise<YahrzeitView> {
    const { tzid, location } = await this.contextOf(userId);
    const row = await this.prisma.yahrzeit.create({
      data: {
        userId,
        name: dto.name,
        hebrewName: dto.hebrewName ?? null,
        relation: dto.relation ?? null,
        deathDate: new Date(`${dto.deathDate.slice(0, 10)}T00:00:00.000Z`),
        afterSunset: dto.afterSunset ?? false,
        note: dto.note ?? null,
        ...(dto.remindDaysBefore ? { remindDaysBefore: dedupe(dto.remindDaysBefore) } : {}),
      },
    });
    return this.toView(row, tzid, location);
  }

  async update(userId: string, id: string, dto: UpdateYahrzeitDto): Promise<YahrzeitView> {
    await this.ensureOwned(userId, id);
    const { tzid, location } = await this.contextOf(userId);
    const row = await this.prisma.yahrzeit.update({
      where: { id },
      data: {
        name: dto.name,
        hebrewName: dto.hebrewName,
        relation: dto.relation,
        deathDate: dto.deathDate
          ? new Date(`${dto.deathDate.slice(0, 10)}T00:00:00.000Z`)
          : undefined,
        afterSunset: dto.afterSunset,
        note: dto.note,
        ...(dto.remindDaysBefore ? { remindDaysBefore: dedupe(dto.remindDaysBefore) } : {}),
      },
    });
    return this.toView(row, tzid, location);
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.yahrzeit.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureOwned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.yahrzeit.findUnique({ where: { id }, select: { userId: true } });
    // Same response whether it is missing or someone else's: a 403 here would
    // confirm the id exists.
    if (!row || row.userId !== userId) throw new NotFoundException('Yahrzeit not found');
  }

  /** Resolve a stored row into the shape the UI reads. */
  toView(row: Yahrzeit, tzid: string, location: GeoPoint | null, now = new Date()): YahrzeitView {
    const deathKey = this.dateKey(row.deathDate);
    // The Hebrew date of death — a day later when death was after sunset.
    const hd = hebrewDateOfDeath(deathKey, row.afterSunset);
    const anchorGregorian = this.dateKey(hd.greg());

    const occ = hebrewRecurrence.nextOccurrence(
      { kind: 'yahrzeit', originalGregorian: anchorGregorian },
      startOfLocalDay(now, tzid),
    );

    let next: YahrzeitView['next'] = null;
    if (occ) {
      const candleDate = previousDay(occ.gregorian);
      const nightfall = location ? zmanimService.nightfallInstant(candleDate, location) : null;
      next = {
        gregorian: occ.gregorian,
        hebrewText: occ.hebrewText,
        hebrewYear: occ.hebrew.year,
        hebrewYearText: gematriya(occ.hebrew.year % 1000),
        daysUntil: wholeDaysBetween(zonedDateKey(now, tzid), occ.gregorian),
        candleAt: nightfall ? formatInTz(nightfall, tzid) : null,
        candleDate,
      };
    }

    return {
      id: row.id,
      name: row.name,
      hebrewName: row.hebrewName,
      relation: row.relation,
      deathDate: deathKey,
      afterSunset: row.afterSunset,
      note: row.note,
      remindDaysBefore: row.remindDaysBefore,
      hebrewDateText: hebrewDateService.describe(hd).hebrewText,
      next,
    };
  }
}

/** Keep the reminder offsets tidy and predictable: unique, descending. */
function dedupe(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => b - a);
}

function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Midnight of the user's current local day, as an instant. */
function startOfLocalDay(now: Date, tzid: string): Date {
  return new Date(`${zonedDateKey(now, tzid)}T00:00:00.000Z`);
}

/** Whole days between two `YYYY-MM-DD` keys, counted on the calendar. */
function wholeDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00.000Z`);
  const b = Date.parse(`${toIso}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

function formatInTz(d: Date, tzid: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tzid,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
