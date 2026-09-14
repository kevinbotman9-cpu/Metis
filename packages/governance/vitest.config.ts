import { defineConfig } from 'vitest/config';

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
});
