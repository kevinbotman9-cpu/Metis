import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // One file at a time. Several files here use one PostgreSQL — migrating
    // it, truncating it, creating and dropping databases beside it — and run
    // in parallel they take each other's locks: a 40P01 in CI, reproduced as
    // 4 deadlocks in 200 rounds (G-078). The suite is I/O-bound against one
    // server, so running files together bought almost nothing.
    // `tests/database-suites-serialised.test.ts` holds every package whose
    // tests open a connection to this.
    fileParallelism: false,
  },
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
