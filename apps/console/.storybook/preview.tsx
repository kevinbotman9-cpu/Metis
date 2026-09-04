import { useEffect } from 'react';
import type { Preview } from '@storybook/react';
import '../app/globals.css';

/**
 * Theme axes: light/dark × compact/comfortable.
 *
 * The tokens are defined on `:root[data-theme=…]`, so the attributes have to go
 * on documentElement — setting them on a wrapper div would not match, which is
 * how the previous decorator ended up hardcoding colours that no longer exist.
 */
const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: {
      config: {
        rules: [{ id: 'color-contrast', enabled: true }],
      },
    },
    backgrounds: { disable: true },
  },

  globalTypes: {
    theme: {
      description: 'Colour scheme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    density: {
      description: 'Row and padding density',
      defaultValue: 'comfortable',
      toolbar: {
        title: 'Density',
        icon: 'component',
        items: [
          { value: 'comfortable', title: 'Comfortable' },
          { value: 'compact', title: 'Compact' },
        ],
        dynamicTitle: true,
      },
    },
  },

  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? 'light';
      const density = context.globals.density ?? 'comfortable';

      useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-density', density);
        root.style.colorScheme = theme;
      }, [theme, density]);

      return (
        <div className="bg-page p-4 text-content" style={{ minHeight: '100%' }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
