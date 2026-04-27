'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserRole } from '@/lib/types';

interface AuthContextType {
  role: UserRole;
  isLoading: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>('public');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setRole(data.role || 'public');
        setIsLoading(false);
      })
      .catch(() => {
        setRole('public');
        setIsLoading(false);
      });
  }, []);

  const login = async (password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setRole('owner');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setRole('public');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{ role, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
