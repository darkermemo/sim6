// eslint.workspace.cjs
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  overrides: [
    // Strict, type-aware lint for the new UI (uses its own tsconfig)
    {
      files: ["siem_unified_pipeline/ui-react/src/**/*.{ts,tsx}"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: "./siem_unified_pipeline/ui-react/tsconfig.app.json",
        tsconfigRootDir: __dirname,
        sourceType: "module",
        ecmaVersion: "latest",
      },
      plugins: ["@typescript-eslint"],
      rules: {
        "@typescript-eslint/no-unused-vars": "error",
      },
    },
    // Non-type-aware lint for root src/tests (TS excluded from tsc; ESLint still checks)
    {
      files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: null, // <-- key: no type-check, lint only
        sourceType: "module",
        ecmaVersion: "latest",
      },
      plugins: ["@typescript-eslint"],
      rules: {
        "@typescript-eslint/no-unused-vars": "error",
        "no-undef": "off",
      },
    },
  ],
};
