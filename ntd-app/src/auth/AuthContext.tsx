import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type SessionUser } from '../lib/api';

const TOKEN_KEY = 'ntd.session';
const LAST_ID_KEY = 'ntd.lastClientId';

type AuthState = {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: SessionUser) => void;
  updateUser: (user: SessionUser) => void;
  signOut: () => Promise<void>;
  lastClientId: string | null;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .me(token)
      .then(({ user: u }) => !cancelled && setUser(u))
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback((newToken: string, newUser: SessionUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(LAST_ID_KEY, newUser.clientId);
    setToken(newToken);
    setUser(newUser);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    if (token) await api.logout(token).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const updateUser = useCallback((nextUser: SessionUser) => setUser(nextUser), []);

  const value = useMemo(
    () => ({ user, token, loading, signIn, signOut, updateUser, lastClientId: localStorage.getItem(LAST_ID_KEY) }),
    [user, token, loading, signIn, signOut, updateUser],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
