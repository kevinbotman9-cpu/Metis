import { defineConfig } from 'vitest/config';

/**
 * Root config: cross-package integration tests only.
 *
 * Each package owns its own unit tests and config. This one covers the seams
 * between them, which is where the two-plane architecture either holds or does
 * not.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
  },
});
