/**
 * @hcal/core — Hebrew calendar core library.
 *
 * Framework-agnostic services for date conversion, holidays, zmanim, and
 * Hebrew-date recurrence. Wraps `@hebcal/core`; no UI or network dependencies.
 */

// Re-export commonly used hebcal primitives for downstream packages.
export { gematriya, HDate, months } from '@hebcal/core';
export * from './dateUtils.js';
export { GregorianRecurrence, gregorianRecurrence } from './GregorianRecurrence.js';
export { HebrewDateService, hebrewDateService } from './HebrewDateService.js';
export {
  eveningOf,
  type HebrewDayBounds,
  hebrewDateOfDeath,
  hebrewDayBounds,
  hebrewDayKeyAt,
  hebrewDayStart,
} from './HebrewDay.js';
export type { HebrewRecurrenceSpec } from './HebrewRecurrence.js';
export { HebrewRecurrence, hebrewRecurrence } from './HebrewRecurrence.js';
export type { HolidayQueryOptions } from './HolidayService.js';
export { HolidayService, holidayService } from './HolidayService.js';
export { isRestTime, type RestReason, type RestWindow, restWindowAt } from './RestTime.js';
export * from './timezone.js';
export * from './types.js';
export type { DailyZmanim, ZmanKey } from './ZmanimService.js';
export { ZmanimService, zmanimService } from './ZmanimService.js';
