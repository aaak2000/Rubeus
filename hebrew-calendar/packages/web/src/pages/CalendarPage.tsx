import { useEffect, useMemo, useState } from 'react';
import { api, type Calendar, type EventInstance } from '../api/client';
import { buildMonthGrid, HEBREW_WEEKDAYS, zmanimFor, type GridDay } from '../hebrew';
import { EventModal } from '../components/EventModal';

const GREG_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string>('');
  const [events, setEvents] = useState<EventInstance[]>([]);
  const [il, setIl] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lon: number; tzid: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo<GridDay[]>(() => buildMonthGrid(year, month, il), [year, month, il]);

  useEffect(() => {
    api.calendars().then((cals) => {
      setCalendars(cals);
      const def = cals.find((c) => c.isDefault) ?? cals[0];
      if (def) setCalendarId(def.id);
    });
    api.profile().then((p) => {
      if (p.settings) {
        setIl(p.settings.il);
        if (p.settings.latitude != null && p.settings.longitude != null) {
          setGeo({ lat: p.settings.latitude, lon: p.settings.longitude, tzid: p.settings.tzid });
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!calendarId) return;
    const start = `${grid[0]!.iso}T00:00:00Z`;
    const end = `${grid[grid.length - 1]!.iso}T23:59:59Z`;
    api.events(calendarId, start, end).then(setEvents);
  }, [calendarId, grid]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventInstance[]>();
    for (const e of events) {
      const d = e.start.slice(0, 10);
      const arr = map.get(d) ?? [];
      arr.push(e);
      map.set(d, arr);
    }
    return map;
  }, [events]);

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  }

  function refresh() {
    setModalDate(null);
    if (!calendarId) return;
    const start = `${grid[0]!.iso}T00:00:00Z`;
    const end = `${grid[grid.length - 1]!.iso}T23:59:59Z`;
    api.events(calendarId, start, end).then(setEvents);
  }

  const zmanim = useMemo(() => {
    if (!selected || !geo) return null;
    return zmanimFor(selected, { latitude: geo.lat, longitude: geo.lon, tzid: geo.tzid, il });
  }, [selected, geo, il]);

  return (
    <div className="calendar-page">
      <div className="cal-toolbar">
        <div className="nav">
          <button onClick={nextMonth}>‹</button>
          <h2>
            {GREG_MONTHS[month - 1]} {year}
          </h2>
          <button onClick={prevMonth}>›</button>
        </div>
        <div className="cal-controls">
          {calendars.length > 1 && (
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <label className="row">
            <input type="checkbox" checked={il} onChange={(e) => setIl(e.target.checked)} /> לוח א״י
          </label>
        </div>
      </div>

      <div className="weekdays">
        {HEBREW_WEEKDAYS.map((d) => (
          <div key={d} className="weekday">
            {d}
          </div>
        ))}
      </div>

      <div className="month-grid">
        {grid.map((day) => {
          const evs = eventsByDate.get(day.iso) ?? [];
          return (
            <div
              key={day.iso}
              className={`day${day.inMonth ? '' : ' out'}${day.isToday ? ' today' : ''}${selected === day.iso ? ' selected' : ''}`}
              onClick={() => setSelected(day.iso)}
              onDoubleClick={() => setModalDate(day.iso)}
            >
              <div className="day-head">
                <span className="greg">{Number(day.iso.slice(8, 10))}</span>
                <span className="heb">{day.hebrewDay}</span>
              </div>
              {day.holidays.map((h, i) => (
                <div key={i} className={`chip holiday ${h.categories[0] ?? ''}`} title={h.titleHe}>
                  {h.emoji ?? ''} {h.titleHe}
                </div>
              ))}
              {evs.map((e) => (
                <div key={e.id + e.start} className={`chip event${e.isOccurrence ? ' occ' : ''}`} title={e.title}>
                  {e.isOccurrence ? '🕯️ ' : ''}
                  {e.title}
                </div>
              ))}
              <button className="add-day" onClick={(ev) => { ev.stopPropagation(); setModalDate(day.iso); }}>
                +
              </button>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="day-detail card">
          <h3>פרטי היום — {selected}</h3>
          {zmanim ? (
            <ul className="zmanim">
              {Object.entries(zmanim.times).map(([k, v]) => (
                <li key={k}>
                  <span className="zk">{k}</span>
                  <span className="zv">{v ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">להצגת זמני היום, הגדירו מיקום ב<b>הגדרות</b>.</p>
          )}
        </div>
      )}

      {modalDate && calendarId && (
        <EventModal calendarId={calendarId} dateIso={modalDate} onClose={() => setModalDate(null)} onCreated={refresh} />
      )}
    </div>
  );
}
