import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccessibilityPage } from './pages/AccessibilityPage';
import { Button, Skeleton, ThemeToggle } from './ui';
import { ConsentBanner, InterstitialAd, useInterstitial } from './ads';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  // An ad must never land on top of work in progress, so any open dialog
  // suppresses it entirely.
  const dialogOpen = typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null;
  const { ad, dismiss } = useInterstitial(dialogOpen);
  const nav = [
    { to: '/', label: 'יומן' },
    { to: '/settings', label: 'הגדרות' },
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      <header className="topbar">
        <span className="brand">
          <span aria-hidden="true">🕯️</span> יומן עברי
        </span>
        <nav aria-label="ניווט ראשי">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} aria-current={loc.pathname === n.to ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <ThemeToggle />
        <span className="topbar-user muted text-sm">{user?.displayName ?? user?.email}</span>
        <Button variant="ghost" size="sm" onClick={logout}>
          יציאה
        </Button>
      </header>
      <main id="main">{children}</main>
      <ConsentBanner />
      {ad && <InterstitialAd ad={ad} onDismiss={dismiss} />}
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="boot-loading" aria-busy="true" aria-label="טוען">
        <Skeleton height={44} />
        <Skeleton height={320} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/accessibility" element={<AccessibilityPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
