/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0a0d14',
          panel: '#121824',
          card: '#1a2233',
          border: '#2a364f',
          accent: '#e63946',
          gold: '#f4a261',
          neonCyan: '#00f5d4',
          neonPink: '#f72585',
          neonAmber: '#ffbe0b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        japanese: ['"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
