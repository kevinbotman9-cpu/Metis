'use client';

import { ReactNode, createContext, useContext, useState } from 'react';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>({
    id: 'user_mock_001',
    email: 'demo@company.com',
    name: 'Demo User',
    roles: ['architect', 'admin'],
    permissions: ['publish:strategies', 'approve:changes', 'view:audit'],
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    // Mock auth: accept any non-empty credentials
    if (email && password) {
      setUser({
        id: 'user_' + Math.random().toString(36).slice(2),
        email,
        name: email.split('@')[0],
        roles: ['architect'],
        permissions: ['publish:strategies', 'view:audit'],
      });
    }
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
  };

  const hasPermission = (permission: string) => {
    return user?.permissions.includes(permission) ?? false;
  };

  const hasRole = (role: string) => {
    return user?.roles.includes(role) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
