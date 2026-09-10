'use client';

import { type ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';
import { AppShell } from './app-shell';
import { LoadingState, PageBody, PageHeader, PermissionDenied } from './ui/primitives';
import { requirementFor } from '@/lib/nav/route-permissions';

/**
 * Wraps every authenticated route. Redirects to /login when there is no
 * session, refuses a path the session is not permitted, and renders the shell
 * around the page once both hold.
 *
 * Waits on isLoading so a page refresh does not bounce a valid session to
 * the login screen before the token has been exchanged.
 *
 * **The permission check lives here rather than in each page.** It was in each
 * page until 2026-09-10, which meant it was in five of them: `/decisions`,
 * `/decision-flows` and `/performance` declared a permission in the navigation
 * manifest and enforced nothing, so the rail hid the link and the URL let
 * anyone signed in walk straight past it. Thirteen more routes declared
 * nothing and checked nothing. A guard each page opts into is a guard some page
 * will forget, and nothing goes red when it does — which is exactly what
 * happened, for as long as the console has existed.
 *
 * `requirementFor` reads the same manifest `buildNav` reads, so the rail and
 * the route cannot disagree about what a screen requires. A page that wants a
 * different answer changes the manifest, where the rail will see it too.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, hasPermission } = useAuth();
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

  const required = requirementFor(pathname);
  if (required && !hasPermission(required.permission)) {
    // Inside the shell, not instead of it. Someone who lands here by following
    // a stale link needs the rail to get somewhere they are allowed to be, and
    // a bare refusal on an empty page is a dead end.
    return (
      <AppShell>
        <PageBody>
          <PageHeader title={required.label} />
          <PermissionDenied permission={required.permission} />
        </PageBody>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
