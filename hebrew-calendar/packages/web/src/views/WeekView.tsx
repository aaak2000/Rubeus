import { zonedTimeKey } from '@hcal/core';
import { HEBREW_WEEKDAYS } from '../hebrew';
import { sortedHolidays, type ViewProps } from './types';

const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const SLOT_PX = 44;

interface Props extends ViewProps {
  tzid: string;
}

/**
 * A week laid out against an hour axis.
 *
 * Timed events are positioned by their local start and duration; all-day
 * entries and holidays sit in a header band above the axis.
 */
export function WeekView({ days, eventsByDate, selected, onSelect, onCreate, onOpenEvent, tzid }: Props) {
  function minutesFromStart(iso: string): number {
    const [h, m] = zonedTimeKey(new Date(iso), tzid).split(':').map(Number);
    return (h! - START_HOUR) * 60 + m!;
  }

  return (
    <div className="week-view">
      <div className="week-head">
        <div className="week-gutter" aria-hidden="true" />
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            className={[
              'week-day-head',
              day.isToday ? 'is-today' : '',
              selected === day.iso ? 'is-selected' : '',
              day.isShabbat || day.isYomTov ? 'is-rest' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelect(day.iso)}
          >
            <span className="week-day-name">{HEBREW_WEEKDAYS[day.weekday]}</span>
            <span className="week-day-nums">
              <span className="day-hebrew">{day.hebrewDay}</span>
              <span className="day-greg">{day.dayOfMonth}</span>
            </span>
            <span className="week-day-chips">
              {sortedHolidays(day)
                .slice(0, 2)
                .map((h, i) => (
                  <span key={i} className="chip chip-holiday" title={h.titleHe}>
                    {h.titleHe}
                  </span>
                ))}
              {(eventsByDate.get(day.iso) ?? [])
                .filter((e) => e.allDay)
                .map((e) => (
                  <span
                    key={e.id + e.start}
                    className={`chip chip-event${e.isOccurrence ? ' is-occurrence' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenEvent(e);
                    }}
                  >
                    {e.title}
                  </span>
                ))}
            </span>
          </button>
        ))}
      </div>

      <div className="week-body" style={{ ['--slot-px' as string]: `${SLOT_PX}px` }}>
        <div className="week-gutter">
          {HOURS.map((h) => (
            <div key={h} className="hour-label">
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((day) => {
          const timed = (eventsByDate.get(day.iso) ?? []).filter((e) => !e.allDay);
          return (
            <div
              key={day.iso}
              className={`week-column${day.isShabbat || day.isYomTov ? ' is-rest' : ''}`}
              onDoubleClick={() => onCreate(day.iso)}
            >
              {HOURS.map((h) => (
                <div key={h} className="hour-slot" />
              ))}
              {timed.map((e) => {
                const top = (minutesFromStart(e.start) / 60) * SLOT_PX;
                const durationMin = Math.max(30, (Date.parse(e.end) - Date.parse(e.start)) / 60000);
                const height = (durationMin / 60) * SLOT_PX;
                if (top + height < 0) return null;
                return (
                  <button
                    key={e.id + e.start}
                    type="button"
                    className={`week-event${e.isOccurrence ? ' is-occurrence' : ''}`}
                    style={{ top: Math.max(0, top), height }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenEvent(e);
                    }}
                  >
                    <span className="week-event-time">{zonedTimeKey(new Date(e.start), tzid)}</span>
                    <span className="week-event-title">{e.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
