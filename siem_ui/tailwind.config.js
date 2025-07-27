/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // SIEM Dark Theme Colors from specification
        background: '#020617', // slate-950
        card: '#0f172a', // slate-900
        border: '#1e293b', // slate-800
        primary: '#64748b', // slate-500 for base primary
        'primary-text': '#e2e8f0', // slate-200
        'secondary-text': '#94a3b8', // slate-400
        accent: '#3b82f6', // blue-500
        // Severity Colors
        'severity-critical': '#ef4444', // red-500
        'severity-high': '#f97316', // orange-500
        'severity-medium': '#eab308', // yellow-500
        'severity-low': '#0ea5e9', // sky-500
        'severity-info': '#6b7280', // gray-500
      },
    },
  },
  plugins: [],
} 