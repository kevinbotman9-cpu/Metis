'use client';

import { type ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';
import { AppShell } from './app-shell';
import { LoadingState } from './ui/primitives';

/**
 * Wraps every authenticated route. Redirects to /login when there is no
 * session, and renders the shell around the page once there is one.
 *
 * Waits on isLoading so a page refresh does not bounce a valid session to
 * the login screen before the token has been exchanged.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-page">
        <LoadingState label="Restoring session" />
      </div>
    );
  }

  if (!user) {
    // The redirect is in flight; render nothing rather than a flash of content.
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
