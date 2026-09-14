import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // JSX, for the handful of tests that render a component rather than call a
  // function. esbuild's automatic runtime rather than `@vitejs/plugin-react`:
  // the plugin is ESM-only and this config is loaded through `require`, which
  // fails to even parse it. Nothing here needs Fast Refresh.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@metis/ui-metadata': path.resolve(__dirname, '../../packages/ui-metadata/src'),
      // Import the domain module directly: packages/core/src/index.ts reads
      // schema files from disk at import time, which no browser or test needs.
      '@metis/core/domain': path.resolve(__dirname, '../../packages/core/src/domain.ts'),
      '@metis/core/utility': path.resolve(__dirname, '../../packages/core/src/utility.ts'),
      '@metis/runtime/deterministic': path.resolve(
        __dirname,
        '../../packages/runtime/src/deterministic'
      ),
      '@metis/compiler/decision-flow': path.resolve(
        __dirname,
        '../../packages/compiler/src/decision-flow'
      ),
    },
  },
});
