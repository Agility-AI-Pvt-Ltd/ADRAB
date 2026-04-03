import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from '../api';
import type { User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  completeLogin: (accessToken: string, refreshToken: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      authApi.me()
        .then(r => setUser(r.data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const completeLogin = async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    await refreshUser();
  };

  const refreshUser = async () => {
    const me = await authApi.me();
    setUser(me.data);
  };

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    await completeLogin(data.access_token, data.refresh_token);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    window.location.href = '/login';
  };

  return <Ctx.Provider value={{ user, loading, login, completeLogin, refreshUser, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
