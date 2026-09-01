import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { currentState, subscribe, unsubscribe, type PushState } from '../notifications/push';
import { SubscriptionSection } from './SubscriptionSection';
import { isValidTimeZone, localTimeZone } from '@hcal/core';
import { api, ApiError, icsExportUrl, type Calendar, type Profile } from '../api/client';
import { Button, EmptyState, Skeleton, Switch, useToast } from '../ui';
import { useAds } from '../ads';
import { useAuth } from '../auth/AuthContext';

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft / Outlook',
  caldav: 'CalDAV',
};

export function SettingsPage() {
  const toast = useToast();
  const ads = useAds();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);

  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [tzid, setTzid] = useState(localTimeZone());
  const [il, setIl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.profile(), api.calendars()])
      .then(([p, cals]) => {
        setProfile(p);
        setCalendars(cals);
        if (p.settings) {
          setLat(p.settings.latitude?.toString() ?? '');
          setLon(p.settings.longitude?.toString() ?? '');
          setTzid(p.settings.tzid);
          setIl(p.settings.il);
        }
      })
      .catch(() => toast.error('טעינת ההגדרות נכשלה'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function saveSettings() {
    const latitude = lat ? Number(lat) : null;
    const longitude = lon ? Number(lon) : null;
    if ((lat && Number.isNaN(latitude)) || (lon && Number.isNaN(longitude))) {
      toast.error('קווי הרוחב והאורך חייבים להיות מספרים');
      return;
    }
    if (!isValidTimeZone(tzid)) {
      toast.error('אזור הזמן אינו מזוהה');
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings({ latitude, longitude, tzid, il });
      toast.success('ההגדרות נשמרו');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'שמירת ההגדרות נכשלה');
    } finally {
      setSaving(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error('הדפדפן אינו תומך באיתור מיקום');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4));
        setLon(pos.coords.longitude.toFixed(4));
        setTzid(localTimeZone());
        toast.success('המיקום עודכן — לא לשכוח לשמור');
      },
      () => toast.error('לא ניתן לאתר את המיקום'),
    );
  }

  async function syncCalendar(id: string) {
    setSyncBusy(id);
    try {
      const r = await api.sync(id);
      const pulled = r.pulledCreated + r.pulledUpdated + r.pulledDeleted;
      const pushed = r.pushedCreated + r.pushedUpdated + r.pushedDeleted;
      toast.success(`הסנכרון הושלם — נמשכו ${pulled}, נדחפו ${pushed}`);
      if (r.errors.length) toast.error(`${r.errors.length} פריטים נכשלו`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'הסנכרון נכשל');
    } finally {
      setSyncBusy(null);
    }
  }

  async function connect(provider: 'google' | 'microsoft') {
    try {
      const { url } = provider === 'google' ? await api.googleUrl() : await api.microsoftUrl();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'לא ניתן להתחיל את החיבור');
    }
  }

  async function onIcsFile(file: File) {
    const target = calendars.find((c) => c.isDefault) ?? calendars[0];
    if (!target) return;
    try {
      const res = await api.importIcs(target.id, await file.text());
      toast.success(`יובאו ${res.imported} אירועים`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'יבוא הקובץ נכשל');
    }
  }

  if (loading) {
    return (
      <div className="settings-page" aria-busy="true">
        <Skeleton height={220} radius={14} />
        <Skeleton height={200} radius={14} />
      </div>
    );
  }

  const defaultCal = calendars.find((c) => c.isDefault) ?? calendars[0];
  const linked = calendars.filter((c) => c.connectionId);

  return (
    <div className="settings-page">
      <section className="card stack" aria-labelledby="loc-h">
        <div>
          <h2 id="loc-h">מיקום וזמנים הלכתיים</h2>
          <p className="muted text-sm">המיקום קובע את זמני היום, ואזור הזמן קובע באיזו שעה נשמרים האירועים.</p>
        </div>
        <div className="grid2">
          <label className="field">
            <span className="field-label">קו רוחב</span>
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="31.7683" />
          </label>
          <label className="field">
            <span className="field-label">קו אורך</span>
            <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="35.2137" />
          </label>
        </div>
        <label className="field">
          <span className="field-label">אזור זמן</span>
          <input value={tzid} onChange={(e) => setTzid(e.target.value)} placeholder="Asia/Jerusalem" />
        </label>
        <Switch
          checked={il}
          onChange={setIl}
          label="לוח החגים של ארץ ישראל"
          hint="יום טוב אחד בחגים, כמקובל בארץ"
        />
        <div className="row-actions">
          <Button variant="ghost" onClick={useMyLocation}>
            איתור אוטומטי
          </Button>
          <Button variant="primary" onClick={saveSettings} loading={saving}>
            שמירה
          </Button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="acc-h">
        <div>
          <h2 id="acc-h">חשבונות מחוברים</h2>
          <p className="muted text-sm">חיבור חשבון יוצר יומן ממופה, שאפשר לסנכרן דו-כיוונית.</p>
        </div>

        {profile?.connections.length ? (
          <ul className="connection-list">
            {profile.connections.map((c) => (
              <li key={c.id}>
                <span className="connection-name">{PROVIDER_NAMES[c.provider] ?? c.provider}</span>
                <span className="muted text-sm">{c.accountEmail ?? 'מחובר'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="אין חשבונות מחוברים" description="חברו חשבון כדי לסנכרן אירועים אוטומטית." />
        )}

        <div className="row-actions">
          <Button variant="secondary" onClick={() => connect('google')}>
            חיבור Google Calendar
          </Button>
          <Button variant="secondary" onClick={() => connect('microsoft')}>
            חיבור Microsoft/Outlook
          </Button>
        </div>

        {linked.length > 0 && (
          <div className="linked-list">
            <h3 className="text-sm">יומנים מקושרים</h3>
            <ul>
              {linked.map((c) => (
                <li key={c.id}>
                  <span className="calendar-dot" style={{ background: c.color ?? 'var(--ink-subtle)' }} aria-hidden="true" />
                  <span className="calendar-name">{c.name}</span>
                  <Button size="sm" variant="ghost" loading={syncBusy === c.id} onClick={() => syncCalendar(c.id)}>
                    סנכרון עכשיו
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="ics-h">
        <div>
          <h2 id="ics-h">יבוא ויצוא</h2>
          <p className="muted text-sm">קובץ iCalendar ‏(.ics) נקרא בכל יומן נפוץ.</p>
        </div>
        {defaultCal && (
          <div className="row-actions">
            <a className="btn btn-secondary btn-md" href={icsExportUrl(defaultCal.id)}>
              הורדת קובץ ICS
            </a>
            <label className="btn btn-secondary btn-md file-button">
              יבוא מקובץ
              <input
                type="file"
                accept=".ics,text/calendar"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onIcsFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}
      </section>

      <NotificationSettings />

      <SubscriptionSection />

      <section className="card stack" aria-labelledby="ads-h">
        <div>
          <h2 id="ads-h">מודעות</h2>
          <p className="muted text-sm">
            המודעות נבחרות מראש ומותאמות לקהל, ואינן מוצגות בשבת ובחג — לפי זמני המיקום שהגדרתם.
          </p>
        </div>

        <Switch
          checked={ads.adsEnabled}
          onChange={ads.setAdsEnabled}
          label="הצגת מודעות"
          hint="כיבוי מסתיר את כל המודעות במכשיר הזה"
        />

        <Switch
          checked={ads.consent === 'accepted'}
          onChange={(v) => ads.setConsent(v ? 'accepted' : 'rejected')}
          disabled={!ads.adsEnabled}
          label="התאמה אישית של מודעות"
          hint="בכיבוי יוצגו מודעות כלליות בלבד, ללא התאמה לפי שימוש"
        />

        {ads.resting && (
          <p className="notice">כרגע שבת או חג — המודעות מושבתות.</p>
        )}
      </section>

      <DeleteAccountSection />

      <p className="text-sm">
        <Link to="/accessibility">הצהרת נגישות</Link>
      </p>
    </div>
  );
}

/**
 * How reminders reach the user.
 *
 * Push is per device, so it is opted into here and stored in the browser's own
 * subscription. Email is per account and has no equivalent moment of consent,
 * so it gets an explicit switch — sending it to everyone who happens to keep a
 * record is not a choice anybody made.
 *
 * The permission prompt fires only when the push switch is turned on. Asking on
 * load is the surest way to a permanent refusal, which cannot be undone from
 * inside the page.
 */
function NotificationSettings() {
  const toast = useToast();
  const [state, setState] = useState<PushState>('unsubscribed');
  const [busy, setBusy] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [hour, setHour] = useState(9);

  useEffect(() => {
    void currentState().then(setState);
    api
      .profile()
      .then((p) => {
        if (!p.settings) return;
        setEmailOn(p.settings.emailReminders);
        setHour(p.settings.reminderHour);
      })
      .catch(() => undefined);
  }, []);

  async function saveEmail(next: boolean) {
    setEmailOn(next);
    try {
      await api.updateSettings({ emailReminders: next });
    } catch {
      setEmailOn(!next);
      toast.error('שמירת ההעדפה נכשלה');
    }
  }

  async function saveHour(next: number) {
    setHour(next);
    try {
      await api.updateSettings({ reminderHour: next });
    } catch {
      toast.error('שמירת השעה נכשלה');
    }
  }

  const on = state === 'subscribed';
  const blocked = state === 'unsupported' || state === 'denied' || state === 'server-disabled';

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      setState(next ? await subscribe() : await unsubscribe());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="notif-h">
      <div>
        <h2 id="notif-h">התראות</h2>
        <p className="muted text-sm">
          תזכורת לאזכרות שמגיעה גם כשהאפליקציה סגורה, לפי הימים שבחרתם לכל שם.
        </p>
      </div>

      <Switch
        checked={on}
        onChange={toggle}
        disabled={busy || blocked}
        label="התראות במכשיר הזה"
        hint="ההרשמה נשמרת לכל מכשיר בנפרד"
      />

      <Switch
        checked={emailOn}
        onChange={saveEmail}
        label="תזכורות במייל"
        hint="כל הודעה כוללת קישור להסרה, גם בלי להתחבר"
      />

      <label className="field">
        <span className="field-label">שעת התזכורת</span>
        <select value={hour} onChange={(e) => saveHour(Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <span className="field-hint">לפי שעון האזור שהגדרתם, לא לפי שעון השרת.</span>
      </label>

      {state === 'denied' && (
        <p className="notice">
          ההרשאה נחסמה בדפדפן. יש לאפשר התראות עבור האתר בהגדרות הדפדפן ואז לנסות שוב.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="notice">
          הדפדפן הזה אינו תומך בהתראות. באייפון יש להתקין את האפליקציה למסך הבית תחילה.
        </p>
      )}
      {state === 'server-disabled' && (
        <p className="notice">התראות אינן מוגדרות בשרת הזה.</p>
      )}
    </section>
  );
}

/**
 * Deleting the account.
 *
 * Kept last and visually separate, because it is the one control here that
 * cannot be undone. The confirmation asks for the word rather than a yes/no,
 * so it cannot be cleared by a reflex tap — everything goes: events, calendars,
 * connected accounts and the memorial records, which are the part nobody can
 * reconstruct from memory.
 */
function DeleteAccountSection() {
  const toast = useToast();
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const PHRASE = 'מחיקה';

  async function remove() {
    setBusy(true);
    try {
      await api.deleteAccount();
      toast.success('החשבון נמחק');
      logout();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'מחיקת החשבון נכשלה');
      setBusy(false);
    }
  }

  return (
    <section className="card stack danger-zone" aria-labelledby="danger-h">
      <div>
        <h2 id="danger-h">מחיקת החשבון</h2>
        <p className="muted text-sm">
          מוחק את החשבון ואת כל מה שנשמר בו: אירועים, יומנים, חשבונות מחוברים ורשימת
          האזכרות. לא ניתן לשחזר.
        </p>
      </div>

      {!confirming ? (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          מחיקת החשבון
        </Button>
      ) : (
        <>
          <label className="field">
            <span className="field-label">כדי לאשר, הקלידו: {PHRASE}</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
          <div className="row-actions">
            <Button
              variant="danger"
              onClick={remove}
              disabled={typed.trim() !== PHRASE}
              loading={busy}
            >
              מחיקה סופית
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              ביטול
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
