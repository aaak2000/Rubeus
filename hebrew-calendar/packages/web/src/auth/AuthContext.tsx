import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { type AuthResponse, api, tokenStore } from '../api/client';

interface AuthState {
  user: AuthResponse['user'] | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    api
      .profile()
      .then((p) => setUser({ id: p.id, email: p.email, displayName: p.displayName }))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const res = await api.login(email, password);
        tokenStore.set(res.accessToken, res.refreshToken);
        setUser(res.user);
      },
      async register(email, password, displayName) {
        const res = await api.register(email, password, displayName);
        tokenStore.set(res.accessToken, res.refreshToken);
        setUser(res.user);
      },
      logout() {
        tokenStore.clear();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
