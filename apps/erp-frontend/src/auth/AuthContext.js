import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, invalidateCache, setAuthToken } from '../api/client';

const TOKEN_KEY = 'hassan-auth-token';
const USER_KEY = 'hassan-auth-user';

const AuthContext = createContext({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  changePassword: async () => {},
  refresh: async () => {},
});

function readStored() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    return { token: token || null, user: raw ? JSON.parse(raw) : null };
  } catch {
    return { token: null, user: null };
  }
}

function writeStored(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore quota errors */
  }
}

export function AuthProvider({ children }) {
  const initial = readStored();
  const [token, setToken] = useState(initial.token);
  const [user, setUser] = useState(initial.user);
  const [loading, setLoading] = useState(!!initial.token);

  // Push the stored token into the axios client before its first request
  // so /auth/me on boot is properly authenticated.
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  // On initial load with a stored token, verify it's still valid.
  useEffect(() => {
    let cancelled = false;
    if (!initial.token) {
      setLoading(false);
      return undefined;
    }
    api
      .get('/auth/me')
      .then((r) => {
        if (cancelled) return;
        setUser(r.data);
        writeStored(initial.token, r.data);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        writeStored(null, null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    setToken(res.data.token);
    setUser(res.data.user);
    setAuthToken(res.data.token);
    invalidateCache();
    writeStored(res.data.token, res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore — local logout still runs */
    }
    setToken(null);
    setUser(null);
    setAuthToken(null);
    invalidateCache();
    writeStored(null, null);
  }, []);

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      // The server rotated our session token; force a fresh login next time.
      setToken(null);
      setUser(null);
      setAuthToken(null);
      invalidateCache();
      writeStored(null, null);
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data);
      writeStored(token, r.data);
    } catch {
      /* ignore */
    }
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, changePassword, refresh }),
    [user, token, loading, login, logout, changePassword, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function isSuperuser(user) {
  return user?.role === 'SUPERUSER';
}
