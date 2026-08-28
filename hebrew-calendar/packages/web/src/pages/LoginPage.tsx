import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'אירעה שגיאה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>📅 יומן עברי</h1>
        <p className="muted">{mode === 'login' ? 'התחברות לחשבון' : 'יצירת חשבון חדש'}</p>
        {mode === 'register' && (
          <label>
            שם תצוגה
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ישראל ישראלי" />
          </label>
        )}
        <label>
          דוא״ל
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          סיסמה
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy} type="submit">
          {busy ? '…' : mode === 'login' ? 'התחברות' : 'הרשמה'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'אין לך חשבון? הרשמה' : 'כבר יש חשבון? התחברות'}
        </button>
      </form>
    </div>
  );
}
