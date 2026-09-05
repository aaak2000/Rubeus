import {
  type GeoPoint,
  type HolidayQueryOptions,
  hebrewDateService,
  holidayService,
  zmanimService,
} from '@hcal/core';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

function parseBool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return v === 'true' || v === '1';
}

function parseGeo(q: Record<string, string>): GeoPoint | undefined {
  if (q.lat === undefined || q.lon === undefined) return undefined;
  const latitude = Number(q.lat);
  const longitude = Number(q.lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new BadRequestException('Invalid lat/lon');
  }
  return {
    latitude,
    longitude,
    tzid: q.tzid ?? 'Asia/Jerusalem',
    il: parseBool(q.il),
    elevation: q.elevation ? Number(q.elevation) : undefined,
    name: q.name,
  };
}

/** Public, stateless Hebrew-calendar endpoints backed by @hcal/core. */
@ApiTags('hebrew')
@Controller('hebrew')
export class HebrewController {
  /** Convert a Gregorian date (?date=YYYY-MM-DD) to its Hebrew equivalent. */
  @Get('convert')
  convert(@Query('date') date?: string) {
    if (!date || !hebrewDateService.isValidGregorian(date)) {
      throw new BadRequestException('Provide a valid ?date=YYYY-MM-DD');
    }
    return hebrewDateService.fromGregorian(date);
  }

  /** Convert a Hebrew date (?year=&month=&day=) to Gregorian. */
  @Get('convert-hebrew')
  convertHebrew(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('day') day: string,
  ) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if ([y, m, d].some(Number.isNaN))
      throw new BadRequestException('year, month, day are required numbers');
    return hebrewDateService.fromHebrew(y, m, d);
  }

  /** Holidays / parasha / omer for a Gregorian month (?year=&month=) or range (?start=&end=). */
  @Get('holidays')
  holidays(@Query() q: Record<string, string>) {
    const opts: HolidayQueryOptions = {
      il: parseBool(q.il),
      sedrot: parseBool(q.sedrot, true),
      omer: parseBool(q.omer, true),
      location: parseGeo(q),
      locale: q.locale ?? 'he',
    };
    if (q.start && q.end) return holidayService.between(q.start, q.end, opts);
    if (q.year && q.month)
      return holidayService.forGregorianMonth(Number(q.year), Number(q.month), opts);
    throw new BadRequestException('Provide either ?year=&month= or ?start=&end=');
  }

  /** Halachic times for a date and location (?date=&lat=&lon=&tzid=). */
  @Get('zmanim')
  zmanim(@Query() q: Record<string, string>) {
    if (!q.date) throw new BadRequestException('?date=YYYY-MM-DD is required');
    const geo = parseGeo(q);
    if (!geo) throw new BadRequestException('?lat= and ?lon= are required');
    return zmanimService.forDate(q.date, geo);
  }

  /** The molad for a Hebrew month (?year=&month=). */
  @Get('molad')
  molad(@Query('year') year: string, @Query('month') month: string) {
    const y = Number(year);
    const m = Number(month);
    if (Number.isNaN(y) || Number.isNaN(m))
      throw new BadRequestException('year and month are required');
    return holidayService.molad(y, m);
  }
}
