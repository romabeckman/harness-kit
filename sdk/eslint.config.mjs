import js from "@eslint/js";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "build/**", ".vscode/**"]
  },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off"
    }
  }
];
