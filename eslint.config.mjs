import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".devservices/**",
      "src/generated/**",
      "next-env.d.ts",
      "evidence/**",
      // The Claude Design handoff bundle — reference prototypes, not our source.
      "complete-platform-design-system/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // NFR-07 / .agents/rules/10-stack.md: no `any` in server code. Enforced repo-wide.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // NFR-10: interface strings are externalised from day one. A hardcoded string in
    // a page or component is a lint error, not a TODO. Everything goes through next-intl.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          // Symbols and punctuation only. Anything a translator would need to change
          // must go through the catalog, so no words are ever allowed here.
          allowedStrings: ["·", "—", "–", "/", ":", "|", "×", "→", "%", "+", "(", ")", ",", "*"],
        },
      ],
    },
  },
  {
    // Scripts and tests are operator-facing, not user-facing: plain strings are fine.
    files: ["scripts/**/*.ts", "prisma/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];

export default eslintConfig;
