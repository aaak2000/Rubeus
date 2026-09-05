import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Skeleton } from '../ui';

/**
 * Where Google's callback lands the browser.
 *
 * The URL carries a single-use code, not a session. This page spends it for a
 * real token pair and gets out of the way — the code is worth one exchange and
 * expires in two minutes, so a copy left in history is inert.
 */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { adopt } = useAuth();
  const [failed, setFailed] = useState(false);
  // React 18 mounts effects twice in development. A second exchange of a
  // single-use code fails by design, so the attempt is guarded rather than
  // the code being made reusable.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = params.get('code');
    if (!code) {
      setFailed(true);
      return;
    }
    api
      .googleExchange(code)
      .then((res) => {
        adopt(res);
        // replace, so Back does not return to a spent code.
        navigate('/', { replace: true });
      })
      .catch(() => setFailed(true));
  }, [params, adopt, navigate]);

  if (failed) {
    return (
      <div className="auth-page">
        <main className="auth-card card stack">
          <h1>ההתחברות לא הושלמה</h1>
          <p className="muted text-sm">
            ייתכן שהקישור כבר נוצל או שפג תוקפו. אפשר פשוט להתחבר שוב.
          </p>
          <Button variant="primary" onClick={() => navigate('/login', { replace: true })}>
            חזרה להתחברות
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <main className="auth-card card stack" role="status" aria-busy="true" aria-label="מתחבר">
        <h1>רגע, מתחברים…</h1>
        <Skeleton height={44} />
      </main>
    </div>
  );
}
