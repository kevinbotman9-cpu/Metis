'use client';

import { useEffect } from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
    },
  },
});

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_MSW === 'true') {
      import('../mocks/browser').then(({ worker }) => {
        worker.start({ onUnhandledRequest: 'bypass' });
      });
      console.log('%c🔧 MOCK MODE', 'color: #FFA500; font-weight: bold;');
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultColorScheme="light" defaultDensity="comfortable">
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
