import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // One file at a time. `tests/migrate.test.ts` creates and drops databases
    // on the shared PostgreSQL, and every package whose tests open a
    // connection runs its files serially (G-078); the rest of this suite is
    // pure and fast, so the cost is a few seconds.
    // `tests/database-suites-serialised.test.ts` holds this.
    fileParallelism: false,
  },
});
