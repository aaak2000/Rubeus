import { useEffect, useState } from 'react';
import { api, icsExportUrl, type Calendar, type Profile } from '../api/client';

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [tzid, setTzid] = useState('Asia/Jerusalem');
  const [il, setIl] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    api.profile().then((p) => {
      setProfile(p);
      if (p.settings) {
        setLat(p.settings.latitude?.toString() ?? '');
        setLon(p.settings.longitude?.toString() ?? '');
        setTzid(p.settings.tzid);
        setIl(p.settings.il);
      }
    });
    api.calendars().then(setCalendars);
  }, []);

  async function saveSettings() {
    await api.updateSettings({
      latitude: lat ? Number(lat) : null,
      longitude: lon ? Number(lon) : null,
      tzid,
      il,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(4));
      setLon(pos.coords.longitude.toFixed(4));
      setTzid(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
  }

  async function connectGoogle() {
    const { url } = await api.googleUrl();
    window.location.href = url;
  }
  async function connectMicrosoft() {
    const { url } = await api.microsoftUrl();
    window.location.href = url;
  }

  async function onIcsFile(file: File) {
    const text = await file.text();
    const def = calendars.find((c) => c.isDefault) ?? calendars[0];
    if (!def) return;
    const res = await api.importIcs(def.id, text);
    setImportResult(`יובאו ${res.imported} אירועים`);
  }

  const defaultCal = calendars.find((c) => c.isDefault) ?? calendars[0];

  return (
    <div className="settings-page">
      <section className="card">
        <h2>מיקום לזמנים הלכתיים</h2>
        <div className="grid2">
          <label>
            קו רוחב
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="31.7683" />
          </label>
          <label>
            קו אורך
            <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="35.2137" />
          </label>
        </div>
        <label>
          אזור זמן
          <input value={tzid} onChange={(e) => setTzid(e.target.value)} />
        </label>
        <label className="row">
          <input type="checkbox" checked={il} onChange={(e) => setIl(e.target.checked)} /> לוח חגים לפי ארץ ישראל
        </label>
        <div className="actions">
          <button className="link-btn" onClick={useMyLocation}>
            השתמש במיקומי
          </button>
          <button className="primary" onClick={saveSettings}>
            שמירה
          </button>
          {saved && <span className="ok">נשמר ✓</span>}
        </div>
      </section>

      <section className="card">
        <h2>חשבונות מחוברים</h2>
        <div className="connections">
          {profile?.connections.length ? (
            <ul>
              {profile.connections.map((c) => (
                <li key={c.id}>
                  {c.provider} — {c.accountEmail ?? 'מחובר'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">אין חשבונות מחוברים עדיין.</p>
          )}
        </div>
        <div className="actions">
          <button className="provider google" onClick={connectGoogle}>
            חיבור Google Calendar
          </button>
          <button className="provider ms" onClick={connectMicrosoft}>
            חיבור Microsoft/Outlook
          </button>
        </div>
        <p className="muted small">
          לאחר החיבור, נוצר יומן ממופה. סנכרון דו-כיווני מופעל מכפתור הסנכרון בכל יומן.
        </p>
      </section>

      <section className="card">
        <h2>יבוא / יצוא ICS</h2>
        {defaultCal && (
          <div className="actions">
            <a className="provider" href={icsExportUrl(defaultCal.id)}>
              הורדת קובץ ICS
            </a>
            <label className="provider file">
              יבוא מקובץ ICS
              <input
                type="file"
                accept=".ics,text/calendar"
                hidden
                onChange={(e) => e.target.files?.[0] && onIcsFile(e.target.files[0])}
              />
            </label>
          </div>
        )}
        {importResult && <div className="ok">{importResult}</div>}
      </section>
    </div>
  );
}
