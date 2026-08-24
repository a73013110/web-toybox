// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import angular from "angular-eslint";

export default defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: "app", style: "camelCase" },
      ],
      "@angular-eslint/component-selector": [
        "error",
        { type: "element", prefix: "app", style: "kebab-case" },
      ],
      // 鐵律：禁止 constructor 參數注入，改用 inject()
      "@angular-eslint/prefer-inject": "error",
      // 鐵律：output 名稱不得與 DOM 原生事件同名（會靜默退回原生監聽）
      "@angular-eslint/no-output-native": "error",
      "@angular-eslint/no-output-on-prefix": "error",
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {
      // 鐵律：禁止 *ngIf / *ngFor / *ngSwitch，改用 @if / @for / @switch
      "@angular-eslint/template/prefer-control-flow": "error",
    },
  },

  // ── 邊界規則（見 CLAUDE.md「邊界」）──
  // 同一個 feature 內部一律用相對路徑，因此在 feature 裡出現 @features/* 就是跨 feature import。
  {
    files: ["src/app/features/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@features/*"],
              message:
                "feature 之間禁止互相 import。同一個 feature 內部請用相對路徑。",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@features/*"], message: "core 禁止 import feature。" },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@features/*", "@core/*"],
              message: "shared 禁止 import feature 與 core，依賴只能往更通用的方向流。",
            },
          ],
        },
      ],
    },
  },
]);
