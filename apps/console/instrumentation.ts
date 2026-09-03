/**
 * Next.js Instrumentation Hook
 * Initializes MSW server in Node.js environment (SSR)
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize MSW server for API mocking in development
    if (process.env.NODE_ENV === 'development') {
      const { server } = await import('./mocks/setup');
      server.listen({ onUnhandledRequest: 'bypass' });
      console.log('✓ MSW server listening (development mode)');
    }
  }
}
