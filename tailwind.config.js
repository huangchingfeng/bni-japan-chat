/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: '#00D4FF',
          'cyan-light': '#33DDFF',
          'cyan-dark': '#0099BB',
          navy: '#0A1628',
          'navy-2': '#0F1D32',
          'navy-3': '#152035',
          'navy-4': '#1B2A45',
          orange: '#FF6B35',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans TC', 'Noto Sans JP', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
