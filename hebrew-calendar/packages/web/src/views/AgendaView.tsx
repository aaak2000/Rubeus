import { zonedTimeKey } from '@hcal/core';
import { GREGORIAN_MONTHS_HE, HEBREW_WEEKDAYS } from '../hebrew';
import { EmptyState } from '../ui';
import { sortedHolidays, type ViewProps } from './types';

interface Props extends ViewProps {
  tzid: string;
}

/**
 * A continuous list of upcoming days. Days with nothing on them are omitted,
 * so the list stays scannable; this is also the default view on narrow
 * screens, where a seven-column grid cannot breathe.
 */
export function AgendaView({ days, eventsByDate, selected, onSelect, onCreate, onOpenEvent, tzid }: Props) {
  const withContent = days.filter((d) => (eventsByDate.get(d.iso)?.length ?? 0) > 0 || d.holidays.length > 0);

  if (withContent.length === 0) {
    return (
      <EmptyState
        icon="🗓️"
        title="אין אירועים בטווח הזה"
        description="הימים הקרובים פנויים. אפשר להוסיף אירוע חדש מתצוגת החודש או מכאן."
      />
    );
  }

  return (
    <ol className="agenda">
      {withContent.map((day) => {
        const events = eventsByDate.get(day.iso) ?? [];
        return (
          <li
            key={day.iso}
            className={[
              'agenda-day',
              day.isToday ? 'is-today' : '',
              selected === day.iso ? 'is-selected' : '',
              day.isShabbat || day.isYomTov ? 'is-rest' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <button type="button" className="agenda-date" onClick={() => onSelect(day.iso)}>
              <span className="agenda-hebrew">
                {day.hebrewDay} {day.hebrewMonth}
              </span>
              <span className="agenda-greg">
                {HEBREW_WEEKDAYS[day.weekday]} · {day.dayOfMonth} ב{GREGORIAN_MONTHS_HE[Number(day.iso.slice(5, 7)) - 1]}
              </span>
              {day.isToday && <span className="agenda-today-badge">היום</span>}
            </button>

            <div className="agenda-items">
              {sortedHolidays(day).map((h, i) => (
                <div key={`h${i}`} className="agenda-item is-holiday">
                  <span className="agenda-time">{h.time ?? '—'}</span>
                  <span className="agenda-title">
                    {h.emoji ? `${h.emoji} ` : ''}
                    {h.titleHe}
                  </span>
                </div>
              ))}
              {events.map((e) => (
                <button
                  key={e.id + e.start}
                  type="button"
                  className={`agenda-item is-event${e.isOccurrence ? ' is-occurrence' : ''}`}
                  onClick={() => onOpenEvent(e)}
                >
                  <span className="agenda-time">
                    {e.allDay ? (
                      'כל היום'
                    ) : (
                      <>
                        {/* Without this the time reads against the wrong civil
                            date: an evening event belongs to this Hebrew day
                            but happened the evening before. */}
                        {e.isEvening && <span className="eve-mark">ליל</span>}
                        {zonedTimeKey(new Date(e.start), tzid)}
                      </>
                    )}
                  </span>
                  <span className="agenda-title">{e.title}</span>
                  {e.location && <span className="agenda-location">{e.location}</span>}
                </button>
              ))}
              <button type="button" className="agenda-add" onClick={() => onCreate(day.iso)}>
                + הוספת אירוע
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
