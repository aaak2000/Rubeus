import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">📅 יומן עברי</div>
        <nav>
          <Link className={loc.pathname === '/' ? 'active' : ''} to="/">
            יומן
          </Link>
          <Link className={loc.pathname === '/settings' ? 'active' : ''} to="/settings">
            הגדרות
          </Link>
        </nav>
        <div className="spacer" />
        <span className="user">{user?.displayName ?? user?.email}</span>
        <button className="link-btn" onClick={logout}>
          יציאה
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">טוען…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
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
