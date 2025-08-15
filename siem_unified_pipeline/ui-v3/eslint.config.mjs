import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Prevent hardcoded style regressions
      "no-restricted-syntax": [
        "error",
        { 
          selector: "Literal[value=/\\brounded-(sm|md|lg|xl)\\b/]", 
          message: "Use rounded-[var(--radius)] or tokens instead of hardcoded rounded classes." 
        },
        { 
          selector: "Literal[value=/\\bh-(8|9|10)\\b/]", 
          message: "Use h-[var(--control-h-*)] instead of hardcoded heights." 
        },
        { 
          selector: "Literal[value=/\\bpx-(2|3|4)\\b/]", 
          message: "Use px-[var(--control-px-*)] instead of hardcoded padding." 
        },
        { 
          selector: "Literal[value=/#([0-9a-fA-F]{3,8})/]", 
          message: "Use semantic color tokens instead of hex colors." 
        },
        { 
          selector: "Literal[value=/\\b(bg|text|border)-(slate|gray|stone|zinc|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\\d{2,3})\\b/]", 
          message: "Use semantic tokens (bg-background, text-foreground, etc.) instead of palette colors." 
        },
      ],
    },
  },
];

export default eslintConfig;
