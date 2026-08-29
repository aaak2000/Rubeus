import { useState, type FormEvent } from 'react';
import { api, ApiError, type EventInstance } from '../api/client';

interface Props {
  calendarId: string;
  /** Create mode: the clicked day (YYYY-MM-DD). */
  dateIso?: string;
  /** Edit mode: the event being edited. */
  event?: EventInstance;
  onClose: () => void;
  onSaved: () => void;
}

export function EventModal({ calendarId, dateIso, event, onClose, onSaved }: Props) {
  const isEdit = Boolean(event);
  const baseDate = event ? event.start.slice(0, 10) : (dateIso ?? new Date().toISOString().slice(0, 10));

  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(event ? event.start.slice(11, 16) : '09:00');
  const [endTime, setEndTime] = useState(event ? event.end.slice(11, 16) : '10:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [hebrewRecurrence, setHebrewRecurrence] = useState(event?.hebrewRecurrence ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const start = allDay ? `${baseDate}T00:00:00Z` : `${baseDate}T${startTime}:00Z`;
      const end = allDay ? `${baseDate}T23:59:59Z` : `${baseDate}T${endTime}:00Z`;
      const body: Record<string, unknown> = { title, start, end, allDay, location: location || undefined };
      if (hebrewRecurrence) {
        body.hebrewRecurrence = hebrewRecurrence;
        body.hebrewRecurrenceDate = baseDate;
      }
      if (isEdit && event) await api.updateEvent(calendarId, event.id, body);
      else await api.createEvent(calendarId, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה בשמירת האירוע');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (!confirm('למחוק את האירוע? הפעולה תמחק את כל הסדרה.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteEvent(calendarId, event.id);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה במחיקת האירוע');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{isEdit ? 'עריכת אירוע' : 'אירוע חדש'} — {baseDate}</h2>
        {event?.isOccurrence && (
          <div className="muted small">שינוי או מחיקה משפיעים על כל הסדרה החוזרת.</div>
        )}
        <label>
          כותרת
          <input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          כל היום
        </label>
        {!allDay && (
          <div className="grid2">
            <label>
              התחלה
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label>
              סיום
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        )}
        <label>
          מיקום
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          חזרה עברית (לפי תאריך עברי)
          <select value={hebrewRecurrence} onChange={(e) => setHebrewRecurrence(e.target.value)}>
            <option value="">ללא</option>
            <option value="yahrzeit">יארצייט</option>
            <option value="birthday">יום הולדת עברי</option>
            <option value="anniversary">יום נישואין עברי</option>
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="actions">
          {isEdit && (
            <button type="button" className="danger" onClick={remove} disabled={busy}>
              מחיקה
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="link-btn" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '…' : 'שמירה'}
          </button>
        </div>
      </form>
    </div>
  );
}
