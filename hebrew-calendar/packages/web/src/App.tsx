import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConsentBanner, InterstitialAd, useInterstitial } from './ads';
import { useAuth } from './auth/AuthContext';
import { BRAND } from './brand';
import { AccessibilityPage } from './pages/AccessibilityPage';
import { AdminAdsPage } from './pages/AdminAdsPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CalendarPage } from './pages/CalendarPage';
import { LoginPage } from './pages/LoginPage';
import { RemindersPage } from './pages/RemindersPage';
import { SettingsPage } from './pages/SettingsPage';
import { UnsubscribePage } from './pages/UnsubscribePage';
import { Button, Logo, Skeleton, ThemeToggle } from './ui';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  // An ad must never land on top of work in progress, so any open dialog
  // suppresses it entirely.
  const dialogOpen =
    typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null;
  const { ad, dismiss } = useInterstitial(dialogOpen);
  const nav = [
    { to: '/', label: 'יומן' },
    { to: '/reminders', label: 'תזכורות' },
    { to: '/settings', label: 'הגדרות' },
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      <header className="topbar">
        <span className="brand">
          <Logo size={22} decorative />
          {BRAND.name}
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
      <div className="boot-loading" role="status" aria-busy="true" aria-label="טוען">
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
      {/* Outside RequireAuth: this is what turns the provider's redirect into
          a session, so demanding one first would be circular. */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {/* Public on purpose: an unsubscribe link that demands a login is one
          most people answer by marking the mail as spam instead. */}
      <Route path="/unsubscribe" element={<UnsubscribePage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reminders"
        element={
          <RequireAuth>
            <RemindersPage />
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
      {/* Not in the main nav: it is for the one account that runs the
          deployment, and a fourth item overflows the top bar at phone width.
          Reached from settings instead. */}
      <Route
        path="/admin/ads"
        element={
          <RequireAuth>
            <AdminAdsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
