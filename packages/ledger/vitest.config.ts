import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // One file at a time. Every suite here talks to the same PostgreSQL, and
    // since 2026-09-11 one of them creates and force-drops databases of its
    // own while another migrates the shared one — a lock pattern PostgreSQL is
    // entitled to refuse, and did: a 40P01 deadlock in ledger on CI and a hook
    // timeout in registry locally, neither reproducible afterwards (G-078).
    // These suites are I/O-bound against one server, so parallelism buys
    // almost nothing and cost a red pull request that reproduced nowhere.
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
