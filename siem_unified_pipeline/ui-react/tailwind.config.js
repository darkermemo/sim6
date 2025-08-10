/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '2rem' },
    extend: {
      borderRadius: { xl: '1rem', '2xl': '1.25rem' },
      colors: { border: 'hsl(var(--border))', bg: 'hsl(var(--background))', fg: 'hsl(var(--foreground))' },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};


