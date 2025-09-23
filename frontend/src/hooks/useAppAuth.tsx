import { useCallback, useEffect, useState, createContext, useContext, type ReactNode } from 'react';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

interface AuthState {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isEditor: boolean;
  register: (data: { name: string; email: string; password: string }) => Promise<AppUser>;
  login: (data: { email: string; password: string }) => Promise<AppUser>;
  logout: () => void;
}

const TOKEN_KEY = 'app_jwt_token';
const USER_KEY = 'app_jwt_user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const userStr = localStorage.getItem(USER_KEY);
      if (token && userStr) {
        const user = JSON.parse(userStr) as AppUser;
        setState({ user, token, loading: false });
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const saveSession = (token: string, user: AppUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    // Sincroniza com chave utilizada pelo useWorkfrontApi para Authorization
  try { localStorage.setItem('wf_access_token', token); } catch { /* ignore storage error */ }
    setState({ user, token, loading: false });
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  try { localStorage.removeItem('wf_access_token'); } catch { /* ignore storage error */ }
    setState({ user: null, token: null, loading: false });
  };

  const register = useCallback(async (data: { name: string; email: string; password: string }) => {
    setError(null);
    const res = await fetch('/api/app-auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Falha ao registrar');
    }
    saveSession(json.accessToken, json.user);
    return json.user as AppUser;
  }, []);

  const login = useCallback(async (data: { email: string; password: string }) => {
    setError(null);
    const res = await fetch('/api/app-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Falha ao logar');
    }
    saveSession(json.accessToken, json.user);
    return json.user as AppUser;
  }, []);

  const value: AuthContextValue = {
    user: state.user,
    token: state.token,
    loading: state.loading,
    error,
    isAdmin: !!state.user?.roles.includes('ADMIN'),
    isEditor: !!state.user?.roles.some(r => r === 'ADMIN' || r === 'EDITOR'),
    register,
    login,
    logout: clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAppAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAppAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
};
