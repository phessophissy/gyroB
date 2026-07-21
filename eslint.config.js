// ESLint flat config for GyroB frontend & test JS.
// Focuses on catching real bugs (no-undef, no-unused-vars) while staying
// friendly to browser ESM globals and Node test globals.
import globals from "globals";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["frontend/**/*.js", "scripts/**/*.js", "test/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-console": "off",
    },
  },
  {
    // Test files may use Node test globals.
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "artifacts/**", "cache/**"],
  },
];
