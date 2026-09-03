'use client';

import type { Metadata } from 'next';
import { ReactNode, useEffect } from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
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
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
    },
  },
});

function RootLayoutContent({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Set initial theme based on system preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Show mock mode banner if enabled
    if (process.env.NEXT_PUBLIC_USE_MSW === 'true') {
      console.log('%c🔧 MOCK MODE ENABLED', 'color: #FFA500; font-weight: bold; font-size: 16px;');
      console.log('%cAll API calls are mocked via MSW. Real backend not available.', 'color: #FFA500;');
    }
  }, []);

  return (
    <html lang="en" className="light">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
      </head>
      <body className="bg-base-100 text-base-900">
        <QueryClientProvider client={queryClient}>
          {/* TODO: Auth context provider */}
          {/* TODO: Theme provider */}
          {children}
        </QueryClientProvider>
      </body>
    </html>
  );
}

export default RootLayoutContent;
