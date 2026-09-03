/**
 * METIS Themes
 * Token sets loaded at runtime (no rebuild required)
 * Four axes: light/dark × compact/comfortable
 * Orthogonal: each axis is independent
 */

import type { ThemeTokens } from '@metis/ui-kit';

export interface ThemePackage {
  id: string;
  name: string;
  version: string;
  colorScheme: 'light' | 'dark';
  density: 'compact' | 'comfortable';
  tokens: ThemeTokens;
}

export const lightCompactTheme: ThemePackage = {
  id: 'theme-light-compact',
  name: 'Light Compact',
  version: '1.0.0',
  colorScheme: 'light',
  density: 'compact',
  tokens: {
    statePass: '#1E7A4E',
    stateBlock: '#B23A3A',
    stateHold: '#A66B00',
    base900: '#14171C',
    base800: '#2D2E33',
    base700: '#464849',
    base600: '#68696E',
    base500: '#8B8C91',
    base400: '#AEAFB4',
    base300: '#D1D2D7',
    base200: '#E8EAED',
    base100: '#F5F6F8',
    accent: '#2563C7',
    spacingXs: '0.25rem',
    spacingSm: '0.5rem',
    spacingMd: '0.75rem',
    spacingLg: '1rem',
    spacingXl: '1.5rem',
    spacing2xl: '2rem',
    radius: '0.375rem',
    radiusSm: '0.25rem',
    radiusMd: '0.375rem',
    radiusLg: '0.5rem',
  },
};

export const lightComfortableTheme: ThemePackage = {
  id: 'theme-light-comfortable',
  name: 'Light Comfortable',
  version: '1.0.0',
  colorScheme: 'light',
  density: 'comfortable',
  tokens: {
    ...lightCompactTheme.tokens,
    spacingXs: '0.375rem',
    spacingSm: '0.75rem',
    spacingMd: '1rem',
    spacingLg: '1.5rem',
    spacingXl: '2rem',
    spacing2xl: '3rem',
  },
};

export const darkCompactTheme: ThemePackage = {
  id: 'theme-dark-compact',
  name: 'Dark Compact',
  version: '1.0.0',
  colorScheme: 'dark',
  density: 'compact',
  tokens: {
    ...lightCompactTheme.tokens,
    base900: '#F5F6F8',
    base800: '#E8EAED',
    base700: '#D1D2D7',
    base600: '#AEAFB4',
    base500: '#8B8C91',
    base400: '#68696E',
    base300: '#464849',
    base200: '#2D2E33',
    base100: '#14171C',
  },
};

export const darkComfortableTheme: ThemePackage = {
  id: 'theme-dark-comfortable',
  name: 'Dark Comfortable',
  version: '1.0.0',
  colorScheme: 'dark',
  density: 'comfortable',
  tokens: {
    ...darkCompactTheme.tokens,
    spacingXs: '0.375rem',
    spacingSm: '0.75rem',
    spacingMd: '1rem',
    spacingLg: '1.5rem',
    spacingXl: '2rem',
    spacing2xl: '3rem',
  },
};

export const allThemes = [
  lightCompactTheme,
  lightComfortableTheme,
  darkCompactTheme,
  darkComfortableTheme,
];

export function applyTheme(theme: ThemePackage): void {
  const root = document.documentElement;
  Object.entries(theme.tokens).forEach(([key, value]) => {
    const cssKey = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssKey, value);
  });
}
