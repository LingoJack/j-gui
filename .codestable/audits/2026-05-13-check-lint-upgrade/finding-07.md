---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: maintainability
confidence: medium
file: eslint.config.js
line: 66-71
---

# Finding-07: 测试文件 override 未放宽 `no-unused-vars`

## 证据

```js
// eslint.config.js:66-71
{
  files: ["**/__tests__/**", "**/*.test.*", "**/*.spec.*", "**/tests/**"],
  rules: {
    "no-console": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
},
```

测试文件 override 放宽了 `no-console` 和 `no-explicit-any`，但未放宽 `no-unused-vars`。测试代码常有 setup/destructuring 产生的未使用变量（如 `const { rerender } = renderHook(...)` 中 `rerender` 未使用），当前配置会报 error。

## 影响

测试文件中的未使用变量报 error（245 个存量 error 中包含测试文件的贡献）。

## 建议

在测试 override 中增加：
```js
"@typescript-eslint/no-unused-vars": ["warn", {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
}],
```
