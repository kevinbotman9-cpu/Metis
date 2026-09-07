'use client';

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';

export type ColorScheme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

interface ThemeContextType {
  colorScheme: ColorScheme;
  density: Density;
  setColorScheme: (s: ColorScheme) => void;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const SCHEME_KEY = 'metis.theme.scheme';
const DENSITY_KEY = 'metis.theme.density';

export function ThemeProvider({
  children,
  defaultColorScheme = 'light',
  defaultDensity = 'comfortable',
}: {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
  defaultDensity?: Density;
}) {
  const [colorScheme, setSchemeState] = useState<ColorScheme>(defaultColorScheme);
  const [density, setDensityState] = useState<Density>(defaultDensity);

  // Read persisted preferences after mount so server and client markup agree.
  useEffect(() => {
    try {
      const s = localStorage.getItem(SCHEME_KEY) as ColorScheme | null;
      const d = localStorage.getItem(DENSITY_KEY) as Density | null;
      if (s === 'light' || s === 'dark') setSchemeState(s);
      if (d === 'compact' || d === 'comfortable') setDensityState(d);
    } catch {
      // Private mode or blocked storage — defaults are fine.
    }
  }, []);

  // The tokens in globals.css key off these attributes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme);
    document.documentElement.style.colorScheme = colorScheme;
  }, [colorScheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  const setColorScheme = useCallback((s: ColorScheme) => {
    setSchemeState(s);
    try {
      localStorage.setItem(SCHEME_KEY, s);
    } catch {
      // Ignore: the in-memory value still applies for this session.
    }
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      // Ignore.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ colorScheme, density, setColorScheme, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
