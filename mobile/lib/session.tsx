import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, Me, setToken, setUnauthorizedHandler } from './api';
import { deleteItem, getItem, getJSON, setItem, setJSON } from './storage';
import { clearAllLocks, loadLocks } from './appLock';
import { clearStore } from './store';

const TOKEN_KEY = 'dabba_token';
const ME_KEY = 'dabba_me';

type AuthValue = {
  ready: boolean;
  me: Me | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: (opts?: { remote?: boolean; wipeLocks?: boolean }) => Promise<void>;
  setMe: (me: Me) => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMeState] = useState<Me | null>(null);

  const setMe = useCallback((m: Me) => {
    setMeState(m);
    setJSON(ME_KEY, m);
  }, []);

  const localSignOut = useCallback(async (wipeLocks: boolean) => {
    setToken(null);
    await deleteItem(TOKEN_KEY);
    await deleteItem(ME_KEY);
    if (wipeLocks) await clearAllLocks();
    clearStore();
    setMeState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localSignOut(false);
    });
    return () => setUnauthorizedHandler(null);
  }, [localSignOut]);

  useEffect(() => {
    (async () => {
      await loadLocks();
      const t = await getItem(TOKEN_KEY);
      if (t) {
        setToken(t);
        const cached = await getJSON<Me | null>(ME_KEY, null);
        if (cached) setMeState(cached);
        try {
          const r = await api<{ member: Me }>('/account/me', { quiet401: true });
          setMe(r.member);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) await localSignOut(false);
        }
      }
      setReady(true);
    })();
  }, [localSignOut, setMe]);

  const signIn = useCallback(
    async (t: string, m: Me) => {
      setToken(t);
      await setItem(TOKEN_KEY, t);
      setMe(m);
    },
    [setMe],
  );

  const signOut = useCallback(
    async ({ remote = true, wipeLocks = true }: { remote?: boolean; wipeLocks?: boolean } = {}) => {
      if (remote) {
        try {
          await api('/account/logout', { method: 'POST', quiet401: true });
        } catch {
          /* already signed out */
        }
      }
      await localSignOut(wipeLocks);
    },
    [localSignOut],
  );

  const refreshMe = useCallback(async () => {
    try {
      const r = await api<{ member: Me }>('/account/me');
      setMe(r.member);
    } catch {
      /* offline */
    }
  }, [setMe]);

  const value = useMemo(() => ({ ready, me, signIn, signOut, setMe, refreshMe }), [ready, me, signIn, signOut, setMe, refreshMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
