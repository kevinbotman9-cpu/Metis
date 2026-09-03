'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';

type ColorScheme = 'light' | 'dark';
type Density = 'compact' | 'comfortable';

interface ThemeContextType {
  colorScheme: ColorScheme;
  density: Density;
  setColorScheme: (scheme: ColorScheme) => void;
  setDensity: (density: Density) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
  defaultDensity?: Density;
}

export function ThemeProvider({
  children,
  defaultColorScheme = 'light',
  defaultDensity = 'comfortable',
}: ThemeProviderProps) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(defaultColorScheme);
  const [density, setDensity] = useState<Density>(defaultDensity);

  useEffect(() => {
    // Load from localStorage
    const savedScheme = localStorage.getItem('theme-color-scheme') as ColorScheme | null;
    const savedDensity = localStorage.getItem('theme-density') as Density | null;

    if (savedScheme) setColorScheme(savedScheme);
    if (savedDensity) setDensity(savedDensity);
  }, []);

  useEffect(() => {
    // Apply to DOM
    const root = document.documentElement;
    root.setAttribute('data-theme', colorScheme);
    root.setAttribute('data-density', density);

    // Save to localStorage
    localStorage.setItem('theme-color-scheme', colorScheme);
    localStorage.setItem('theme-density', density);
  }, [colorScheme, density]);

  return (
    <ThemeContext.Provider value={{ colorScheme, density, setColorScheme, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
