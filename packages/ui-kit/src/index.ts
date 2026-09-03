/**
 * METIS UI Kit
 *
 * Radix UI-based primitives across all four theme axes:
 * - Light / Dark
 * - Compact / Comfortable
 *
 * All colours resolve through CSS custom properties (token layer).
 * No literal colour or spacing values in component code.
 */

// Radix exports (re-exported for convenience)
export * from '@radix-ui/react-dialog';
export * from '@radix-ui/react-dropdown-menu';
export * from '@radix-ui/react-select';
export * from '@radix-ui/react-popover';
export * from '@radix-ui/react-tabs';
export * from '@radix-ui/react-command';
export * from '@radix-ui/react-alert-dialog';
export * from '@radix-ui/react-collapsible';
export * from '@radix-ui/react-context-menu';
export * from '@radix-ui/react-hover-card';
export * from '@radix-ui/react-label';
export * from '@radix-ui/react-menubar';
export * from '@radix-ui/react-navigation-menu';
export * from '@radix-ui/react-progress';
export * from '@radix-ui/react-radio-group';
export * from '@radix-ui/react-scroll-area';
export * from '@radix-ui/react-slider';
export * from '@radix-ui/react-switch';
export * from '@radix-ui/react-toggle';
export * from '@radix-ui/react-toggle-group';
export * from '@radix-ui/react-toolbar';
export * from '@radix-ui/react-tooltip';

// Component compositions (built in Storybook, exported here)
// TODO: Button, Input, Select, Combobox, Dialog, Drawer, Tabs, Toast, Tooltip, Table, Tree, CodeBlock, DiffViewer, EmptyState, ErrorState, ProvenanceChip

// Theme system
export interface ThemeTokens {
  // Semantic colors (load-bearing, reserved for decision states)
  statePass: string;   // eligible, approved, passed
  stateBlock: string;  // eliminated, blocked, failed
  stateHold: string;   // suppressed, pending, stale

  // Base greys
  base900: string;
  base800: string;
  base700: string;
  base600: string;
  base500: string;
  base400: string;
  base300: string;
  base200: string;
  base100: string;

  // Interactive
  accent: string;

  // Spacing
  spacingXs: string;
  spacingSm: string;
  spacingMd: string;
  spacingLg: string;
  spacingXl: string;
  spacing2xl: string;

  // Border radius
  radius: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
}

export interface ThemeAxis {
  colorScheme: 'light' | 'dark';
  density: 'compact' | 'comfortable';
  accessibility?: 'normal' | 'high-contrast' | 'reduced-motion' | 'dyslexia-friendly';
}

export interface ComponentSize {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

// Token loading
export function loadThemeTokens(element: HTMLElement, tokens: ThemeTokens): void {
  const root = element instanceof HTMLHtmlElement ? element : document.documentElement;

  Object.entries(tokens).forEach(([key, value]) => {
    const cssKey = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssKey, value);
  });
}

// Theming utilities
export const themeAxes = {
  colorScheme: ['light', 'dark'] as const,
  density: ['compact', 'comfortable'] as const,
  accessibility: ['normal', 'high-contrast', 'reduced-motion', 'dyslexia-friendly'] as const,
};

export const defaultTheme: ThemeTokens = {
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
  spacingMd: '1rem',
  spacingLg: '1.5rem',
  spacingXl: '2rem',
  spacing2xl: '3rem',
  radius: '0.375rem',
  radiusSm: '0.25rem',
  radiusMd: '0.375rem',
  radiusLg: '0.5rem',
};

export const darkTheme: ThemeTokens = {
  ...defaultTheme,
  base900: '#F5F6F8',
  base800: '#E8EAED',
  base700: '#D1D2D7',
  base600: '#AEAFB4',
  base500: '#8B8C91',
  base400: '#68696E',
  base300: '#464849',
  base200: '#2D2E33',
  base100: '#14171C',
};
