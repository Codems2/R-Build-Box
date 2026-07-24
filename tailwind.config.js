/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FDECF0',
          100: '#FBD5DE',
          200: '#F5A8BB',
          300: '#EE7794',
          400: '#E64D72',
          500: '#D92B53',
          600: '#C21E45',
          700: '#9E1838',
          800: '#75122A',
          900: '#4A0C1C',
        },
        accent: {
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
        },
        ink: {
          950: '#0B0A0B',
          900: '#131113',
          800: '#1B181A',
          700: '#252124',
          600: '#332E31',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        thai: ['Noto Sans Thai', 'Leelawadee UI', 'Thonburi', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(217, 43, 83, 0.45)',
        card: '0 10px 30px -12px rgba(0, 0, 0, 0.55)',
      },
    },
  },
  plugins: [],
};
