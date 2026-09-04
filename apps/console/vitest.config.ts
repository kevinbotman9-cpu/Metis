import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Import the domain module directly: packages/core/src/index.ts reads
      // schema files from disk at import time, which no browser or test needs.
      '@metis/core/domain': path.resolve(__dirname, '../../packages/core/src/domain.ts'),
      '@metis/runtime/deterministic': path.resolve(
        __dirname,
        '../../packages/runtime/src/deterministic'
      ),
    },
  },
});
