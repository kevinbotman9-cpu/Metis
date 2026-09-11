import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // One file at a time: these files share one PostgreSQL, and in parallel
    // they take each other's locks (G-078). See packages/ledger/vitest.config.ts;
    // `tests/database-suites-serialised.test.ts` holds this.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // packages/core/src/index.ts reads schema files from disk at import time,
      // so consumers take the domain module directly.
      '@metis/core/domain': path.resolve(__dirname, '../core/src/domain.ts'),
      '@metis/core/utility': path.resolve(__dirname, '../core/src/utility.ts'),
      '@metis/compiler/decision-flow': path.resolve(__dirname, '../compiler/src/decision-flow/index.ts'),
    },
  },
});
