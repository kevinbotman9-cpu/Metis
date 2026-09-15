import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // As in packages/runtime: the core package's root reads schema files from
      // disk at import time, so consumers take the modules directly.
      '@metis/core/domain': path.resolve(__dirname, '../../packages/core/src/domain.ts'),
      '@metis/core/utility': path.resolve(__dirname, '../../packages/core/src/utility.ts'),
    },
  },
});
