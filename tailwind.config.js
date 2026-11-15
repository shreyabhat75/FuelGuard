/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a1a2e',
          900: '#0f2440',
          800: '#16324f',
          700: '#1e4066',
          600: '#2a517c',
        },
        primary: {
          50: '#eef4ff',
          100: '#dce7fe',
          200: '#c0d3fd',
          300: '#94b6fb',
          400: '#618ff7',
          500: '#3d69f1',
          600: '#264ae5',
          700: '#1e3ad2',
          800: '#1e32aa',
          900: '#1e2f86',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 36, 64, 0.06), 0 1px 3px rgba(15, 36, 64, 0.08)',
        pop: '0 10px 30px rgba(15, 36, 64, 0.18)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans Kannada',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
