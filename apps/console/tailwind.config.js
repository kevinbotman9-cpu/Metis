/**
 * Tailwind is a thin mapping onto the CSS custom properties in globals.css.
 * Colours resolve through rgb(var(--token) / <alpha-value>) so opacity
 * modifiers (bg-accent/10) work and dark mode is a token swap, not a variant.
 *
 * Never add a literal colour here — add a token to globals.css first.
 */

const rgb = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        page: rgb('page'),
        chrome: rgb('chrome'),
        surface: {
          DEFAULT: rgb('surface'),
          raised: rgb('surface-raised'),
          sunken: rgb('surface-sunken'),
        },
        border: {
          DEFAULT: rgb('border'),
          strong: rgb('border-strong'),
        },
        content: {
          DEFAULT: rgb('text'),
          muted: rgb('text-muted'),
          subtle: rgb('text-subtle'),
          inverse: rgb('text-inverse'),
        },
        accent: {
          DEFAULT: rgb('accent'),
          hover: rgb('accent-hover'),
          subtle: rgb('accent-subtle'),
        },
        'on-accent': rgb('on-accent'),
        'on-block': rgb('on-block'),
        brand: {
          from: rgb('brand-from'),
          via: rgb('brand-via'),
          to: rgb('brand-to'),
        },
        'on-brand': rgb('on-brand'),
        header: {
          from: rgb('header-from'),
          via: rgb('header-via'),
          to: rgb('header-to'),
          border: rgb('header-border'),
        },
        'on-header': rgb('on-header'),
        pass: { DEFAULT: rgb('pass'), subtle: rgb('pass-subtle') },
        block: { DEFAULT: rgb('block'), subtle: rgb('block-subtle') },
        hold: { DEFAULT: rgb('hold'), subtle: rgb('hold-subtle') },
        info: { DEFAULT: rgb('info'), subtle: rgb('info-subtle') },
        l0: rgb('l0'),
        l1: rgb('l1'),
        l2: rgb('l2'),
        l3: rgb('l3'),
        l4: rgb('l4'),
      },
      borderColor: {
        DEFAULT: rgb('border'),
      },
      spacing: {
        cell: 'var(--cell-x)',
        'cell-y': 'var(--cell-y)',
        card: 'var(--card-p)',
        stack: 'var(--stack)',
      },
      height: {
        row: 'var(--row-h)',
      },
      minHeight: {
        row: 'var(--row-h)',
      },
      fontSize: {
        body: 'var(--text-body)',
        label: 'var(--text-label)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
