import type { Calendar } from '../api/client';
import { Button } from '../ui';
import type { ViewMode } from '../views/types';

interface Props {
  /** Hebrew month/year, the primary title for a Hebrew calendar. */
  hebrewLabel: string;
  /** Gregorian month/year, shown as secondary context. */
  gregorianLabel: string;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  calendars: Calendar[];
  calendarId: string;
  onCalendarChange: (id: string) => void;
  syncing: boolean;
  canSync: boolean;
  onSync: () => void;
}

const VIEWS: Array<{ value: ViewMode; label: string; key: string }> = [
  { value: 'month', label: 'חודש', key: 'M' },
  { value: 'week', label: 'שבוע', key: 'W' },
  { value: 'agenda', label: 'סדר יום', key: 'A' },
  { value: 'year', label: 'שנה', key: 'Y' },
];

export function CalendarHeader({
  hebrewLabel,
  gregorianLabel,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  calendars,
  calendarId,
  onCalendarChange,
  syncing,
  canSync,
  onSync,
}: Props) {
  return (
    <header className="cal-header">
      <div className="cal-title-block">
        <div className="cal-nav">
          {/* RTL: "previous" sits on the right, matching reading direction. */}
          <Button variant="ghost" size="sm" iconOnly aria-label="החודש הקודם" onClick={onPrev}>
            ›
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label="החודש הבא" onClick={onNext}>
            ‹
          </Button>
        </div>
        <div className="cal-titles">
          <h1 className="cal-hebrew" aria-live="polite">
            {hebrewLabel}
          </h1>
          <p className="cal-gregorian muted text-sm">{gregorianLabel}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onToday} title="קיצור: T">
          היום
        </Button>
      </div>

      <div className="cal-actions">
        {calendars.length > 1 && (
          <label className="cal-select">
            <span className="visually-hidden">בחירת יומן</span>
            <select value={calendarId} onChange={(e) => onCalendarChange(e.target.value)}>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {canSync && (
          <Button variant="secondary" size="sm" loading={syncing} onClick={onSync}>
            {syncing ? 'מסנכרן…' : 'סנכרון'}
          </Button>
        )}

        <div className="view-switch" role="radiogroup" aria-label="תצוגת יומן">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={view === v.value}
              className={`view-option${view === v.value ? ' is-active' : ''}`}
              title={`קיצור: ${v.key}`}
              onClick={() => onViewChange(v.value)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
