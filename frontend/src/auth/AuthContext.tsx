import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (input: { username_or_email: string; password: string }) => Promise<void>;
  register: (input: { username: string; email: string; password: string; display_name: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const cachedUserKey = "wikindle:user";

function readCachedUser() {
  try {
    const value = localStorage.getItem(cachedUserKey);
    return value ? (JSON.parse(value) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  if (user) localStorage.setItem(cachedUserKey, JSON.stringify(user));
  else localStorage.removeItem(cachedUserKey);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then(({ user }) => {
        setUser(user);
        writeCachedUser(user);
      })
      .catch(() => setUser(navigator.onLine ? null : readCachedUser()))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(input) {
      const result = await api.login(input);
      setUser(result.user);
      writeCachedUser(result.user);
    },
    async register(input) {
      const result = await api.register(input);
      setUser(result.user);
      writeCachedUser(result.user);
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        setUser(null);
        writeCachedUser(null);
      }
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

