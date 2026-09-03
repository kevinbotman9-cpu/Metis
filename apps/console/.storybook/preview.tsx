import type { Preview } from '@storybook/react';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      // Apply theme based on story parameter
      const theme = context.parameters.theme || 'light';
      const density = context.parameters.density || 'comfortable';

      return (
        <div
          data-theme={theme}
          data-density={density}
          style={{
            '--base-100': theme === 'dark' ? '#14171C' : '#F5F6F8',
            '--base-900': theme === 'dark' ? '#F5F6F8' : '#14171C',
          } as React.CSSProperties}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
