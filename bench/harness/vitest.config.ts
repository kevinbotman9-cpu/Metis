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
      // Same reason as packages/runtime: packages/core/src/index.ts reads
      // schema files from disk at import time, so consumers take the domain
      // module directly.
      '@metis/core/domain': path.resolve(__dirname, '../../packages/core/src/domain.ts'),
      '@metis/runtime/deterministic': path.resolve(
        __dirname,
        '../../packages/runtime/src/deterministic'
      ),
      '@metis/runtime': path.resolve(__dirname, '../../packages/runtime/src/index.ts'),
      '@metis/datasets': path.resolve(__dirname, '../datasets/src/index.ts'),
    },
  },
});
