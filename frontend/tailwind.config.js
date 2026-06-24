/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0f1a',
        accent: '#6c5ce7',
        wagreen: '#16a34a',
      },
    },
  },
  plugins: [],
};
