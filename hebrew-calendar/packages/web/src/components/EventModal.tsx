import { useState, type FormEvent } from 'react';
import { zonedDateKey, zonedDateTimeToUtc, zonedTimeKey } from '@hcal/core';
import { api, ApiError, type EventInstance } from '../api/client';
import { Button, ConfirmDialog, Modal, Switch, useToast } from '../ui';
import { hebrewDayText, hebrewMonthName } from '../hebrew';
import { hebrewDateService } from '@hcal/core';

interface Props {
  calendarId: string;
  /** Create mode: the clicked day (YYYY-MM-DD). */
  dateIso?: string;
  /** Edit mode: the event being edited. */
  event?: EventInstance;
  /** The user's timezone — the context in which entered times are read. */
  tzid: string;
  onClose: () => void;
  onSaved: () => void;
}

const RECURRENCE_OPTIONS = [
  { value: '', label: 'ללא חזרה' },
  { value: 'yahrzeit', label: 'יארצייט (לפי התאריך העברי)' },
  { value: 'birthday', label: 'יום הולדת עברי' },
  { value: 'anniversary', label: 'יום נישואין עברי' },
];

export function EventModal({ calendarId, dateIso, event, tzid, onClose, onSaved }: Props) {
  const toast = useToast();
  const isEdit = Boolean(event);
  const baseDate = event ? zonedDateKey(new Date(event.start), tzid) : (dateIso ?? zonedDateKey(new Date(), tzid));

  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(event ? zonedTimeKey(new Date(event.start), tzid) : '09:00');
  const [endTime, setEndTime] = useState(event ? zonedTimeKey(new Date(event.end), tzid) : '10:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [hebrewRecurrence, setHebrewRecurrence] = useState(event?.hebrewRecurrence ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hebrew = hebrewDateService.fromGregorian(baseDate).hebrew;
  const hebrewLabel = `${hebrewDayText(hebrew.day)} ב${hebrewMonthName(hebrew.month, hebrew.year)}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!allDay && endTime <= startTime) {
      setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Entered times are wall-clock in the user's timezone; convert to UTC
      // instants so 09:00 in Jerusalem is stored as 06:00Z, not 09:00Z.
      const start = zonedDateTimeToUtc(baseDate, allDay ? '00:00' : startTime, tzid).toISOString();
      const end = allDay
        ? new Date(zonedDateTimeToUtc(baseDate, '00:00', tzid).getTime() + 24 * 3600_000 - 1000).toISOString()
        : zonedDateTimeToUtc(baseDate, endTime, tzid).toISOString();

      const body: Record<string, unknown> = { title, start, end, allDay };
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
          <div className="grid2">
            <label className="field">
              <span className="field-label">שעת התחלה</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">שעת סיום</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        )}

        <label className="field">
          <span className="field-label">מיקום</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="לא חובה" />
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
