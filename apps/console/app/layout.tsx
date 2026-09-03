'use client';

import { ReactNode, useEffect, useState } from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import './globals.css';

// MSW initialization in browser
if (typeof window !== 'undefined') {
  if (process.env.NEXT_PUBLIC_USE_MSW === 'true') {
    import('../mocks/browser').then(({ worker }) => {
      worker.start({ onUnhandledRequest: 'bypass' });
    });
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
    },
  },
});

function RootLayoutContent({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Log mock mode
    if (process.env.NEXT_PUBLIC_USE_MSW === 'true') {
      console.log('%c🔧 MOCK MODE', 'color: #FFA500; font-weight: bold;');
      console.log('All API calls use MSW mocks. See docs/gaps.md for status.');
    }
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
      </head>
      <body className="bg-base-100 text-base-900">
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultColorScheme="light" defaultDensity="comfortable">
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}

export default RootLayoutContent;
