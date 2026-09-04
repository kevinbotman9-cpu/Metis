/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'state-pass': '#1E7A4E',
        'state-block': '#B23A3A',
        'state-hold': '#A66B00',
        'base-900': '#14171C',
        'base-800': '#2D2E33',
        'base-700': '#464849',
        'base-600': '#68696E',
        'base-500': '#8B8C91',
        'base-400': '#AEAFB4',
        'base-300': '#D1D2D7',
        'base-200': '#E8EAED',
        'base-100': '#F5F6F8',
        'accent': '#2563C7',
      },
    },
  },
  plugins: [],
};
