import { defineConfig, globalIgnores } from "eslint/config";

const legacyReactHooksCompatibility = {
  rules: {
    "exhaustive-deps": {
      meta: { type: "suggestion", schema: [] },
      create() { return {}; },
    },
  },
};

export default defineConfig([
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": legacyReactHooksCompatibility },
    rules: { "react-hooks/exhaustive-deps": "off" },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
