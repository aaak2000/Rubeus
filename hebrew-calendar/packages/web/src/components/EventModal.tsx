import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

interface Props {
  calendarId: string;
  dateIso: string;
  onClose: () => void;
  onCreated: () => void;
}

export function EventModal({ calendarId, dateIso, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [hebrewRecurrence, setHebrewRecurrence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const start = allDay ? `${dateIso}T00:00:00Z` : `${dateIso}T${startTime}:00Z`;
      const end = allDay ? `${dateIso}T23:59:59Z` : `${dateIso}T${endTime}:00Z`;
      const body: Record<string, unknown> = { title, start, end, allDay, location: location || undefined };
      if (hebrewRecurrence) {
        body.hebrewRecurrence = hebrewRecurrence;
        body.hebrewRecurrenceDate = dateIso;
      }
      await api.createEvent(calendarId, body);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה ביצירת האירוע');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>אירוע חדש — {dateIso}</h2>
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
