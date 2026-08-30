/**
 * @hcal/core — Hebrew calendar core library.
 *
 * Framework-agnostic services for date conversion, holidays, zmanim, and
 * Hebrew-date recurrence. Wraps `@hebcal/core`; no UI or network dependencies.
 */
export * from './types.js';
export * from './dateUtils.js';
export * from './timezone.js';
export { HebrewDateService, hebrewDateService } from './HebrewDateService.js';
export { HolidayService, holidayService } from './HolidayService.js';
export type { HolidayQueryOptions } from './HolidayService.js';
export { ZmanimService, zmanimService } from './ZmanimService.js';
export type { DailyZmanim, ZmanKey } from './ZmanimService.js';
export { HebrewRecurrence, hebrewRecurrence } from './HebrewRecurrence.js';
export type { HebrewRecurrenceSpec } from './HebrewRecurrence.js';
export { GregorianRecurrence, gregorianRecurrence } from './GregorianRecurrence.js';
export { restWindowAt, isRestTime, type RestWindow, type RestReason } from './RestTime.js';
export {
  hebrewDayKeyAt,
  hebrewDayBounds,
  hebrewDayStart,
  eveningOf,
  hebrewDateOfDeath,
  type HebrewDayBounds,
} from './HebrewDay.js';

// Re-export commonly used hebcal primitives for downstream packages.
export { HDate, months, gematriya } from '@hebcal/core';
