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
      // packages/core/src/index.ts reads schema files from disk at import time,
      // so consumers take the domain module directly.
      '@metis/core/domain': path.resolve(__dirname, '../core/src/domain.ts'),
    },
  },
});
