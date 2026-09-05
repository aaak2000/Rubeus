import { useRef } from 'react';
import { HEBREW_WEEKDAYS, HEBREW_WEEKDAYS_SHORT } from '../hebrew';
import { Skeleton } from '../ui';
import { sortedHolidays, type ViewProps } from './types';

const MAX_CHIPS = 3;

/**
 * The month grid.
 *
 * Exposed as an ARIA grid so assistive technology announces it as a table of
 * days, and arrow keys move between cells the way a calendar is expected to.
 */
/** Stable ids for the loading placeholders — six weeks of seven days. */
const SKELETON_CELLS = Array.from({ length: 42 }, (_, i) => `skeleton-${i}`);

export function MonthView({
  days,
  eventsByDate,
  selected,
  onSelect,
  onCreate,
  onOpenEvent,
  loading,
}: ViewProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const moves: Record<string, number> = {
      // RTL: ArrowRight moves to the earlier day, ArrowLeft to the later one.
      ArrowRight: -1,
      ArrowLeft: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCreate(days[index]!.iso);
      return;
    }
    let target: number | null = null;
    if (e.key in moves) target = index + moves[e.key]!;
    else if (e.key === 'Home') target = index - (index % 7);
    else if (e.key === 'End') target = index - (index % 7) + 6;
    if (target === null) return;
    e.preventDefault();
    const clamped = Math.max(0, Math.min(days.length - 1, target));
    onSelect(days[clamped]!.iso);
    gridRef.current?.querySelectorAll<HTMLElement>('[role="gridcell"]')[clamped]?.focus();
  }

  if (loading) {
    return (
      <div className="month-skeleton" aria-hidden="true">
        {SKELETON_CELLS.map((id) => (
          <Skeleton key={id} height={96} radius={10} />
        ))}
      </div>
    );
  }

  return (
    <div className="month-view">
      <div className="weekday-row" aria-hidden="true">
        {HEBREW_WEEKDAYS.map((d, i) => (
          <div key={d} className={`weekday${i === 6 ? ' is-shabbat' : ''}`}>
            <span className="weekday-long">{d}</span>
            <span className="weekday-short">{HEBREW_WEEKDAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>

      <div className="month-grid" role="grid" aria-label="לוח חודשי" ref={gridRef}>
        {days.map((day, i) => {
          const events = eventsByDate.get(day.iso) ?? [];
          const chips = sortedHolidays(day);
          const shown = [
            ...chips.map((h) => ({ kind: 'holiday' as const, item: h })),
            ...events.map((e) => ({ kind: 'event' as const, item: e })),
          ];
          const visible = shown.slice(0, MAX_CHIPS);
          const overflow = shown.length - visible.length;
          const isSelected = selected === day.iso;

          return (
            <div
              key={day.iso}
              role="gridcell"
              tabIndex={isSelected || (!selected && i === 0) ? 0 : -1}
              aria-selected={isSelected}
              aria-label={`${day.dayOfMonth} ב${day.hebrewMonth}, ${day.hebrewDay}${
                chips.length ? `, ${chips.map((c) => c.titleHe).join(', ')}` : ''
              }${events.length ? `, ${events.length} אירועים` : ''}`}
              className={[
                'day-cell',
                day.inMonth ? '' : 'is-outside',
                day.isToday ? 'is-today' : '',
                isSelected ? 'is-selected' : '',
                day.isShabbat || day.isYomTov ? 'is-rest' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(day.iso)}
              onDoubleClick={() => onCreate(day.iso)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <div className="day-numbers">
                <span className="day-hebrew">{day.hebrewDay}</span>
                <span className="day-greg">{day.dayOfMonth}</span>
              </div>

              <div className="day-chips">
                {visible.map((entry) =>
                  entry.kind === 'holiday' ? (
                    <span
                      key={entry.item.titleHe}
                      className={`chip chip-holiday${entry.item.categories.includes('parashat') ? ' is-parasha' : ''}`}
                      title={entry.item.titleHe}
                    >
                      {entry.item.titleHe}
                    </span>
                  ) : (
                    <button
                      key={entry.item.id + entry.item.start}
                      type="button"
                      className={[
                        'chip',
                        entry.item.isEvening ? 'chip-evening' : 'chip-event',
                        entry.item.isOccurrence ? 'is-occurrence' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={entry.item.title}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpenEvent(entry.item);
                      }}
                    >
                      {/* The Hebrew day began the evening before; say so, or a
                          21:00 entry on this cell looks like a mistake. */}
                      {entry.item.isEvening && <span className="chip-eve-mark">ליל</span>}
                      {entry.item.title}
                    </button>
                  ),
                )}
                {overflow > 0 && (
                  <button
                    type="button"
                    className="chip chip-more"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(day.iso);
                    }}
                  >
                    ועוד {overflow}
                  </button>
                )}
              </div>

              <button
                type="button"
                className="day-add"
                aria-label={`הוספת אירוע ב-${day.dayOfMonth} ב${day.hebrewMonth}`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onCreate(day.iso);
                }}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
