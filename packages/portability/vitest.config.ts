import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      // Same mapping as the sibling packages: consumers take modules directly
      // rather than a barrel, so a package with no build step resolves.
      '@metis/core/domain': path.resolve(__dirname, '../core/src/domain.ts'),
      '@metis/core/utility': path.resolve(__dirname, '../core/src/utility.ts'),
      '@metis/compiler/decision-flow': path.resolve(__dirname, '../compiler/src/decision-flow'),
      // Before the bare package alias: Vite matches these as prefixes in
      // order, so '@metis/runtime' alone would swallow the subpath and point
      // at index.ts/deterministic/engine.
      '@metis/runtime/deterministic': path.resolve(__dirname, '../runtime/src/deterministic'),
      '@metis/runtime': path.resolve(__dirname, '../runtime/src/index.ts'),
      '@metis/registry': path.resolve(__dirname, '../registry/src/index.ts'),
      '@metis/ledger': path.resolve(__dirname, '../ledger/src/index.ts'),
      '@metis/catalogue': path.resolve(__dirname, '../catalogue/src/index.ts'),
    },
  },
});
