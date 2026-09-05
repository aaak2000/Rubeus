import type { EventInstance } from '../api/client';
import type { GridDay } from '../hebrew';

export type ViewMode = 'month' | 'week' | 'agenda' | 'year';

export interface ViewProps {
  days: GridDay[];
  eventsByDate: Map<string, EventInstance[]>;
  selected: string | null;
  onSelect: (iso: string) => void;
  onCreate: (iso: string) => void;
  onOpenEvent: (event: EventInstance) => void;
  loading?: boolean;
}

/** Chips are ordered so festivals read before the weekly portion. */
export function sortedHolidays(day: GridDay) {
  return [...day.holidays].sort((a, b) => {
    const rank = (c: string[]) =>
      c.includes('holiday') ? 0 : c.includes('roshchodesh') ? 1 : c.includes('parashat') ? 3 : 2;
    return rank(a.categories) - rank(b.categories);
  });
}
