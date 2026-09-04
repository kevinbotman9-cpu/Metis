'use client';

import { ReactNode, createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient, TOKEN_KEY, ApiError, type AuthUserDto } from '@/lib/api-client';

interface AuthContextType {
  user: AuthUserDto | null;
  /** True until the initial session probe resolves. Guards must wait on this. */
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore the session from a stored token on first mount.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const { user: restored } = await apiClient.getSession();
        if (!cancelled) setUser(restored);
      } catch (e) {
        // Only a 401 means the token is genuinely no longer valid. A network
        // blip or a server error must not silently sign the user out.
        if (e instanceof ApiError && e.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
        } else {
          setError('Could not reach the session service. Try reloading.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    // MSW registers its worker asynchronously; a session probe fired before the
    // worker is listening would fall through to the network and 404. Retry once
    // on the next tick rather than logging the user out spuriously.
    const timer = setTimeout(restore, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const { token, user: authed } = await apiClient.login(email, password);
      localStorage.setItem(TOKEN_KEY, token);
      setUser(authed);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : 'Could not reach the authentication service.';
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setError(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user]
  );

  const hasRole = useCallback((role: string) => Boolean(user?.roles.includes(role)), [user]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, login, logout, hasPermission, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
