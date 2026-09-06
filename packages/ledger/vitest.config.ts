import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      // Consumers take the domain and utility modules directly rather than a
      // package barrel, so a package with no build step resolves in tests.
      '@metis/core/domain': path.resolve(__dirname, '../core/src/domain.ts'),
      '@metis/core/utility': path.resolve(__dirname, '../core/src/utility.ts'),
      '@metis/runtime': path.resolve(__dirname, '../runtime/src/index.ts'),
    },
  },
});
