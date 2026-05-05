import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import prettier from "@vue/eslint-config-prettier";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.d.ts", "auto-imports.d.ts", "components.d.ts"],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
