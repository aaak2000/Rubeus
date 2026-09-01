import {
  eveningOf,
  type GeoPoint,
  hebrewDateService,
  zmanimService,
  zonedDateKey,
  zonedDateTimeToUtc,
  zonedTimeKey,
} from '@hcal/core';
import { type FormEvent, useMemo, useState } from 'react';
import { ApiError, api, type EventInstance } from '../api/client';
import { hebrewDayText, hebrewMonthName } from '../hebrew';
import { Button, ConfirmDialog, Modal, Switch, useToast } from '../ui';

interface Props {
  calendarId: string;
  /** Create mode: the clicked day (YYYY-MM-DD). */
  dateIso?: string;
  /** Edit mode: the event being edited. */
  event?: EventInstance;
  /** The user's timezone — the context in which entered times are read. */
  tzid: string;
  /** Where the user is — needed to know when the Hebrew day turns. */
  geo?: GeoPoint | null;
  onClose: () => void;
  onSaved: () => void;
}

const RECURRENCE_OPTIONS = [
  { value: '', label: 'ללא חזרה' },
  { value: 'yahrzeit', label: 'יארצייט (לפי התאריך העברי)' },
  { value: 'birthday', label: 'יום הולדת עברי' },
  { value: 'anniversary', label: 'יום נישואין עברי' },
];

export function EventModal({ calendarId, dateIso, event, tzid, geo, onClose, onSaved }: Props) {
  const toast = useToast();
  const isEdit = Boolean(event);
  // The day the user picked is a *Hebrew* day — that is what the grid shows.
  const baseDate = event
    ? (event.hebrewDay ?? zonedDateKey(new Date(event.start), tzid))
    : (dateIso ?? zonedDateKey(new Date(), tzid));

  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(
    event ? zonedTimeKey(new Date(event.start), tzid) : '09:00',
  );
  const [endTime, setEndTime] = useState(event ? zonedTimeKey(new Date(event.end), tzid) : '10:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [hebrewRecurrence, setHebrewRecurrence] = useState(event?.hebrewRecurrence ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hebrew = hebrewDateService.fromGregorian(baseDate).hebrew;
  const hebrewLabel = `${hebrewDayText(hebrew.day)} ב${hebrewMonthName(hebrew.month, hebrew.year)}`;

  // The Hebrew day begins at sunset the evening before. A time at or after
  // that sunset therefore belongs to this Hebrew date but falls on the
  // *previous* Gregorian one — which is what "ליל" means. Without a location
  // there is no sunset to place it by, so the civil day is used unchanged.
  const eveningDate = eveningOf(baseDate);
  const sunsetLocal = useMemo(() => {
    if (!geo) return null;
    const instant = zmanimService.sunsetInstant(eveningDate, geo);
    return instant ? zonedTimeKey(instant, tzid) : null;
  }, [geo, eveningDate, tzid]);

  const isEvening = !allDay && sunsetLocal !== null && startTime >= sunsetLocal;
  // The Gregorian date the instant is actually stored on.
  const gregorianDate = isEvening ? eveningDate : baseDate;
  // An end time at or before the start means the event runs past midnight —
  // ordinary for an evening one, so it lands on the following day.
  const endsNextDay = !allDay && endTime <= startTime;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Entered times are wall-clock in the user's timezone; convert to UTC
      // instants so 09:00 in Jerusalem is stored as 06:00Z, not 09:00Z. The
      // date they sit on is `gregorianDate`, which for an evening time is the
      // day before the Hebrew date the user picked.
      const startAt = zonedDateTimeToUtc(gregorianDate, allDay ? '00:00' : startTime, tzid);
      const endAt = allDay
        ? new Date(zonedDateTimeToUtc(gregorianDate, '00:00', tzid).getTime() + DAY_MS - 1000)
        : new Date(
            zonedDateTimeToUtc(gregorianDate, endTime, tzid).getTime() + (endsNextDay ? DAY_MS : 0),
          );

      const body: Record<string, unknown> = {
        title,
        start: startAt.toISOString(),
        end: endAt.toISOString(),
        allDay,
      };
      if (location) body.location = location;
      if (hebrewRecurrence) {
        body.hebrewRecurrence = hebrewRecurrence;
        body.hebrewRecurrenceDate = baseDate;
      }
      if (isEdit && event) await api.updateEvent(calendarId, event.id, body);
      else await api.createEvent(calendarId, body);
      toast.success(isEdit ? 'האירוע עודכן' : 'האירוע נוצר');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שמירת האירוע נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    try {
      await api.deleteEvent(calendarId, event.id);
      toast.success('האירוע נמחק');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת האירוע נכשלה');
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  if (confirmingDelete && event) {
    return (
      <ConfirmDialog
        title="מחיקת אירוע"
        message={
          event.isOccurrence
            ? 'האירוע חוזר. המחיקה תסיר את כל הסדרה, לא רק את המופע הזה.'
            : `למחוק את "${event.title}"? לא ניתן לבטל את הפעולה.`
        }
        confirmLabel="מחיקה"
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    );
  }

  return (
    <Modal
      title={isEdit ? 'עריכת אירוע' : 'אירוע חדש'}
      description={`${hebrewLabel} · ${baseDate}`}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              מחיקה
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" type="submit" form="event-form" loading={busy}>
            שמירה
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="stack">
        {event?.isOccurrence && (
          <p className="notice">שינוי או מחיקה משפיעים על כל הסדרה החוזרת.</p>
        )}

        <label className="field">
          <span className="field-label">כותרת</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>

        <Switch checked={allDay} onChange={setAllDay} label="אירוע של יום שלם" />

        {!allDay && (
          <>
            <div className="grid2">
              <label className="field">
                <span className="field-label">שעת התחלה</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">שעת סיום</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
            {/* The Hebrew date is the one the user chose either way; what
                changes is the civil date it lands on. Saying so plainly is
                what keeps an evening event from looking like a mistake. */}
            <p className="day-hint" aria-live="polite">
              {isEvening ? (
                <>
                  <b>ליל {hebrewLabel}</b> — מוצג בתאריך העברי שבחרתם, ונשמר לערב של{' '}
                  {formatGregorian(eveningDate)}, לאחר השקיעה ({sunsetLocal}).
                </>
              ) : (
                <>
                  <b>{hebrewLabel}</b> — {formatGregorian(baseDate)}
                  {sunsetLocal && <> · היום העברי מתחיל אמש ב-{sunsetLocal}</>}
                </>
              )}
              {endsNextDay && <> האירוע מסתיים למחרת בבוקר.</>}
            </p>
          </>
        )}

        <label className="field">
          <span className="field-label">מיקום</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="לא חובה"
          />
        </label>

        <label className="field">
          <span className="field-label">חזרה שנתית לפי הלוח העברי</span>
          <select value={hebrewRecurrence} onChange={(e) => setHebrewRecurrence(e.target.value)}>
            {RECURRENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

const DAY_MS = 24 * 3600_000;

/** `2026-09-17` as `17.9.2026` — compact enough to sit inside a sentence. */
function formatGregorian(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}
