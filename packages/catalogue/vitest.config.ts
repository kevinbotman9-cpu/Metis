import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      '@metis/core/domain': path.resolve(__dirname, '../core/src/domain.ts'),
    },
  },
});
