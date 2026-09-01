import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, ThemeToggle } from '../ui';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

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
          <span className="auth-mark" aria-hidden="true">
            🕯️
          </span>
          <h1>יומן עברי</h1>
          <p className="muted text-sm">
            {isRegister ? 'יצירת חשבון חדש' : 'לוח עברי מלא, מסונכרן עם היומנים שלכם'}
          </p>
        </div>

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
