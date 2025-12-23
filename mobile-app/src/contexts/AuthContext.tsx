import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const apiEnv = (import.meta as any)?.env ?? {};
const API_BASE_URL: string = apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  phone: string;
  role: string;
  assigned_villages?: string[];
  requiresPasswordChange?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (payload: {
    username: string;
    email?: string;
    phone: string;
    password: string;
    role?: string;
    villageName?: string;
  }) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'jalrakshak_token';
const USER_KEY = 'jalrakshak_user';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedToken = window.localStorage.getItem(TOKEN_KEY);
      const storedUser = window.localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistAuth = (nextToken: string, nextUser: AuthUser) => {
    setToken(nextToken);
    setUser(nextUser);
    try {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } catch {
      // ignore storage errors
    }
  };

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Login failed');
    }
    const data = await res.json();
    // Store assigned_villages and requiresPasswordChange from login response
    persistAuth(data.token, {
      ...data.user,
      assigned_villages: data.user.assigned_villages || [],
      requiresPasswordChange: data.user.requiresPasswordChange || false
    });
  };

  const signup = async (payload: {
    username: string;
    email?: string;
    phone: string;
    password: string;
    role?: string;
    name?: string;
    district?: string;
    mandal?: string;
    village_id?: string;
  }) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Signup failed');
    }
    const body = await res.json();
    
    // If worker registration requires approval, return without logging in
    if (body.requiresApproval) {
      return { requiresApproval: true, request: body.request };
    }
    
    // After successful signup, log the user in
    await login(payload.username || payload.phone, payload.password);
    return { requiresApproval: false };
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to change password');
    }
    
    // Update user to remove requiresPasswordChange flag
    if (user) {
      const updatedUser = { ...user, requiresPasswordChange: false };
      persistAuth(token, updatedUser);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        signup,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};


