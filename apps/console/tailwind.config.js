/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic colors (load-bearing, reserved for decision states)
        'state-pass': 'var(--state-pass, #1E7A4E)',
        'state-block': 'var(--state-block, #B23A3A)',
        'state-hold': 'var(--state-hold, #A66B00)',

        // Base greys with slight blue cast
        'base-900': 'var(--base-900, #14171C)',
        'base-100': 'var(--base-100, #F5F6F8)',

        // Interactive accent
        'accent': 'var(--accent, #2563C7)',
      },
      spacing: {
        // All spacing should use CSS variables
        'xs': 'var(--spacing-xs, 0.25rem)',
        'sm': 'var(--spacing-sm, 0.5rem)',
        'md': 'var(--spacing-md, 1rem)',
        'lg': 'var(--spacing-lg, 1.5rem)',
        'xl': 'var(--spacing-xl, 2rem)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius, 0.375rem)',
        sm: 'var(--radius-sm, 0.25rem)',
        md: 'var(--radius-md, 0.375rem)',
        lg: 'var(--radius-lg, 0.5rem)',
      },
      fontSize: {
        'xs': '0.75rem',
        'sm': '0.875rem',
        'base': '1rem',
        'lg': '1.125rem',
        'xl': '1.25rem',
      },
      fontFamily: {
        // Use system fonts + Inter/IBM Plex as fallback
        sans: 'var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif)',
        mono: 'var(--font-mono, ui-monospace, "Cascadia Code", monospace)',
      },
    },
  },
  plugins: [],
};
