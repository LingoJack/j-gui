import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/target/**",
      "**/node_modules/**",
      "**/.tauri/**",
      "src-tauri/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
    },
    settings: {},
    rules: {
      // React Hooks — 强约束
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // React Refresh
      // 这个规则更偏 Vite HMR 体验提示，不适合作为仓库默认阻断门禁。
      "react-refresh/only-export-components": "off",

      // import 规范
      "import/no-duplicates": "warn",
      "import/no-cycle": "off",
      "import/order": "off",

      // TypeScript 强约束（配合 CLAUDE.md）
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-empty-interface": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // 通用
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // 关闭与 TypeScript 冲突的规则
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.*", "**/*.spec.*", "**/tests/**"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
