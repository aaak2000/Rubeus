import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BRAND } from '../brand';
import { Button, Logo, ThemeToggle } from '../ui';

export function LoginPage() {
  const { login, register } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(
    // The provider callback sends people back here when the sign-in did not
    // complete — declined consent, or an address Google has not verified.
    params.get('error') === 'google' ? 'ההתחברות עם Google לא הושלמה. נסו שוב.' : null,
  );
  const [busy, setBusy] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const isRegister = mode === 'register';

  useEffect(() => {
    // Ask rather than assume: a deployment without Google credentials should
    // show no button at all, not one that fails when pressed.
    api
      .authMethods()
      .then((m) => setGoogleAvailable(m.google))
      .catch(() => setGoogleAvailable(false));
  }, []);

  async function startGoogle() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.googleSignInUrl();
      window.location.href = url;
    } catch {
      setError('לא ניתן להתחיל התחברות עם Google כרגע');
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(email, password, displayName || undefined);
      else await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'אירעה שגיאה, נסו שוב');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-corner">
        <ThemeToggle />
      </div>

      <main className="auth-card card">
        <div className="auth-brand">
          <span className="auth-mark">
            <Logo size={44} decorative />
          </span>
          <h1>{BRAND.name}</h1>
          <p className="brand-tagline">{BRAND.tagline}</p>
          <p className="muted text-sm">
            {isRegister ? 'יצירת חשבון חדש' : `${BRAND.descriptor} — ימי הולדת, יארצייטים ומועדים`}
          </p>
        </div>

        {googleAvailable && (
          <>
            <Button type="button" variant="secondary" onClick={startGoogle} loading={busy}>
              <GoogleMark />
              המשך עם Google
            </Button>
            <p className="auth-divider">
              <span>או</span>
            </p>
          </>
        )}

        <form onSubmit={submit} className="stack">
          {isRegister && (
            <label className="field">
              <span className="field-label">שם תצוגה</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ישראל ישראלי"
              />
            </label>
          )}
          <label className="field">
            <span className="field-label">דוא״ל</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">סיסמה</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isRegister && <span className="field-hint">לפחות 8 תווים</span>}
          </label>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {googleAvailable && !isRegister && (
            // Someone who signed up with Google has no password, so the form
            // would just say "invalid credentials" — true, and unhelpful.
            <p className="field-hint">נרשמתם עם Google? השתמשו בכפתור שלמעלה.</p>
          )}

          <Button variant="primary" type="submit" loading={busy}>
            {isRegister ? 'יצירת חשבון' : 'התחברות'}
          </Button>
        </form>

        <p className="auth-switch text-sm">
          {isRegister ? 'כבר יש לכם חשבון?' : 'אין לכם חשבון עדיין?'}{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => setMode(isRegister ? 'login' : 'register')}
          >
            {isRegister ? 'התחברות' : 'הרשמה'}
          </button>
        </p>
      </main>

      <footer className="auth-footer text-sm">
        <Link to="/accessibility">הצהרת נגישות</Link>
      </footer>
    </div>
  );
}

/** Google's mark, inline so the button needs no network request to render. */
function GoogleMark() {
  return (
    <svg className="provider-mark" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
