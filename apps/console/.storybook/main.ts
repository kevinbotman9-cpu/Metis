import type { StorybookConfig } from '@storybook/react-vite';
import path from 'node:path';

/**
 * Framework is react-vite, not @storybook/nextjs.
 *
 * @storybook/nextjs 7.6 resolves `next/config`, which Next.js 16 removed, so it
 * cannot boot against this app. Nothing in these stories needs Next — they
 * render presentational components — so the plain React builder is both
 * correct and considerably faster. Revisit if a story ever needs next/image or
 * the app router.
 */
const config: StorybookConfig = {
  stories: ['../components/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: { autodocs: 'tag' },
  staticDirs: ['../public'],
  viteFinal: async (viteConfig) => {
    viteConfig.resolve = viteConfig.resolve ?? {};
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias ?? {}),
      '@': path.resolve(__dirname, '..'),
      // packages/core/src/index.ts reads schema files from disk at import time,
      // so consumers take the domain module directly.
      '@metis/core/domain': path.resolve(__dirname, '../../../packages/core/src/domain.ts'),
    };
    return viteConfig;
  },
};

export default config;
