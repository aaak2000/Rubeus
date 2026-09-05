/**
 * The repeat choices the event form offers, and their iCalendar equivalents.
 *
 * Hebrew and Gregorian recurrence are one control, not two: an event that
 * repeats both on the 27th of Av *and* every Tuesday is not a thing anyone
 * means. Presenting them as separate fields invites setting both and getting
 * something nobody asked for.
 */
export type RecurrenceChoice =
  | ''
  | 'yahrzeit'
  | 'birthday'
  | 'anniversary'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly';

const HEBREW_CHOICES = ['yahrzeit', 'birthday', 'anniversary'] as const;

export function isHebrewChoice(choice: RecurrenceChoice): boolean {
  return (HEBREW_CHOICES as readonly string[]).includes(choice);
}

/** iCalendar weekday codes, indexed by `Date.getUTCDay()`. */
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/**
 * The RRULE for a Gregorian choice, or null for anything else.
 *
 * A weekly rule names its weekday explicitly rather than leaving the library
 * to infer one from the start date: the stored rule then still means the same
 * thing if the event is ever moved.
 */
export function rruleFor(choice: RecurrenceChoice, dateIso: string): string | null {
  switch (choice) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly': {
      // Midday avoids a timezone offset tipping the date onto its neighbour.
      const weekday = new Date(`${dateIso}T12:00:00Z`).getUTCDay();
      return `FREQ=WEEKLY;BYDAY=${BYDAY[weekday]}`;
    }
    case 'monthly':
      return 'FREQ=MONTHLY';
    case 'yearly':
      return 'FREQ=YEARLY';
    default:
      return null;
  }
}

/**
 * Read a stored RRULE back into the choice that would produce it.
 *
 * Only the frequencies this form can express are recognised. A rule that came
 * from elsewhere — an imported ICS, or a synced provider — may say more than
 * the form can, so it reports '' and the caller leaves the rule alone rather
 * than flattening it into something simpler.
 */
export function choiceFromRrule(rrule: string | null | undefined): RecurrenceChoice {
  if (!rrule) return '';
  const freq = /FREQ=([A-Z]+)/.exec(rrule.toUpperCase())?.[1];
  switch (freq) {
    case 'DAILY':
      return 'daily';
    case 'WEEKLY':
      return 'weekly';
    case 'MONTHLY':
      return 'monthly';
    case 'YEARLY':
      return 'yearly';
    default:
      return '';
  }
}

/** True when the stored rule says more than the form's options can. */
export function isComplexRrule(rrule: string | null | undefined): boolean {
  if (!rrule) return false;
  if (choiceFromRrule(rrule) === '') return true;
  const upper = rrule.toUpperCase();
  // COUNT, UNTIL, INTERVAL and the BY* parts beyond a weekly BYDAY all carry
  // meaning this form has no control for.
  if (/\b(COUNT|UNTIL|INTERVAL|BYMONTHDAY|BYMONTH|BYSETPOS|BYWEEKNO|BYYEARDAY)=/.test(upper)) {
    return true;
  }
  const byday = /BYDAY=([A-Z,+-\d]+)/.exec(upper)?.[1];
  // One weekday is what "weekly" means here; a list of them is not.
  return byday?.includes(',') ?? false;
}
