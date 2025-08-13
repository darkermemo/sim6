// Minimal ESLint config for basic syntax checking
export default [
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Basic syntax rules only
      'no-undef': 'error',
      'no-unused-vars': 'warn',
      'no-unreachable': 'error',
      'no-console': 'off', // Allow console in dev
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js'],
  },
];
