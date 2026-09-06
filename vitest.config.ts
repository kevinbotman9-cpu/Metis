import { defineConfig } from 'vitest/config';
import path from 'node:path';

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
  resolve: {
    alias: {
      // The packages under test import each other by name. Same mapping as the
      // per-package configs; without it the integration suite resolves through
      // the workspace symlink to a `dist` that no build step produces.
      '@metis/core/domain': path.resolve(__dirname, 'packages/core/src/domain.ts'),
      '@metis/core/utility': path.resolve(__dirname, 'packages/core/src/utility.ts'),
    },
  },
});
