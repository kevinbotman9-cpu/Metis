'use client';

import { useEffect, useState } from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * The dev API is served by app/api/[...path]/route.ts, so nothing has to be
 * intercepted client-side. MSW stays opt-in (NEXT_PUBLIC_USE_MSW=true) for
 * environments where you want request-level mocking, but it is not required:
 * service workers do not register in every embedded browser context.
 */
const useMsw = process.env.NEXT_PUBLIC_USE_MSW === 'true';

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!useMsw);

  useEffect(() => {
    if (!useMsw) return;
    let cancelled = false;

    import('../mocks/browser')
      .then(({ startWorker }) => startWorker())
      .catch((e) => {
        // Route handlers still answer, so this degrades rather than breaks.
        console.warn('[metis] MSW did not start; falling back to route handlers.', e);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultColorScheme="light" defaultDensity="comfortable">
        <AuthProvider>{ready ? children : null}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
