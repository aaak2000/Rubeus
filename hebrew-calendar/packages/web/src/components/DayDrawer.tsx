import { useMemo } from 'react';
import { zonedTimeKey, type GeoPoint } from '@hcal/core';
import type { EventInstance } from '../api/client';
import { GREGORIAN_MONTHS_HE, HEBREW_WEEKDAYS, ZMAN_LABELS, ZMAN_ORDER, hebrewYearText, zmanimFor, type GridDay } from '../hebrew';
import { Button, EmptyState } from '../ui';
import { InlineAd } from '../ads';

interface Props {
  day: GridDay;
  events: EventInstance[];
  geo: GeoPoint | null;
  tzid: string;
  onClose: () => void;
  onCreate: (iso: string) => void;
  onOpenEvent: (event: EventInstance) => void;
}

/** Zmanim that mark the day's boundaries deserve visual emphasis. */
const EMPHASIS = new Set(['sunrise', 'sunset', 'tzeit']);

/**
 * Everything about one day: its events, the festivals and weekly portion
 * falling on it, and the halachic times for the user's location.
 */
export function DayDrawer({ day, events, geo, tzid, onClose, onCreate, onOpenEvent }: Props) {
  const zmanim = useMemo(() => (geo ? zmanimFor(day.iso, geo) : null), [day.iso, geo]);
  const gregMonth = GREGORIAN_MONTHS_HE[Number(day.iso.slice(5, 7)) - 1];

  return (
    <aside className="day-drawer" aria-label={`פרטי היום ${day.hebrewDay} ${day.hebrewMonth}`}>
      <header className="drawer-head">
        <div>
          <h2 className="drawer-hebrew">
            {day.hebrewDay} ב{day.hebrewMonth} {hebrewYearText(day.hebrewYear)}
          </h2>
          <p className="drawer-greg muted text-sm">
            יום {HEBREW_WEEKDAYS[day.weekday]} · {day.dayOfMonth} ב{gregMonth} {day.iso.slice(0, 4)}
          </p>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="סגירת פרטי היום" onClick={onClose}>
          ✕
        </Button>
      </header>

      {day.holidays.length > 0 && (
        <section className="drawer-section">
          <h3 className="drawer-title">מועדי היום</h3>
          <ul className="drawer-holidays">
            {day.holidays.map((h, i) => (
              <li key={i}>
                <span className="holiday-dot" aria-hidden="true" />
                <span>
                  {h.emoji ? `${h.emoji} ` : ''}
                  {h.titleHe}
                </span>
                {h.time && <span className="holiday-time">{h.time}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="drawer-section">
        <div className="drawer-title-row">
          <h3 className="drawer-title">אירועים</h3>
          <Button size="sm" variant="secondary" onClick={() => onCreate(day.iso)}>
            הוספה
          </Button>
        </div>
        {events.length === 0 ? (
          <p className="muted text-sm">אין אירועים ביום זה.</p>
        ) : (
          <ul className="drawer-events">
            {events.map((e) => (
              <li key={e.id + e.start}>
                <button type="button" className="drawer-event" onClick={() => onOpenEvent(e)}>
                  <span className="drawer-event-time">
                    {e.allDay ? (
                      'כל היום'
                    ) : (
                      <>
                        {e.isEvening && <span className="eve-mark">ליל</span>}
                        {zonedTimeKey(new Date(e.start), tzid)}–{zonedTimeKey(new Date(e.end), tzid)}
                      </>
                    )}
                  </span>
                  <span className="drawer-event-title">{e.title}</span>
                  {e.location && <span className="drawer-event-loc muted text-xs">{e.location}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="drawer-section">
        <h3 className="drawer-title">זמני היום</h3>
        {zmanim ? (
          <dl className="zmanim-list">
            {ZMAN_ORDER.map((key) => {
              const meta = ZMAN_LABELS[key];
              const value = zmanim.times[key];
              if (!meta) return null;
              return (
                <div key={key} className={`zman${EMPHASIS.has(key) ? ' is-emphasis' : ''}`}>
                  <dt>
                    <span className="zman-label">{meta.label}</span>
                    <span className="zman-description">{meta.description}</span>
                  </dt>
                  <dd className="zman-value">{value ?? '—'}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <EmptyState
            title="לא הוגדר מיקום"
            description="כדי להציג זמנים הלכתיים, הגדירו קו רוחב ואורך בעמוד ההגדרות."
          />
        )}
      </section>

      {/* Below the day's own content, so it never competes with it. */}
      <InlineAd />
    </aside>
  );
}
