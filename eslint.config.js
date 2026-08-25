// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

export default defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended
    ],
    processor: angular.processInlineTemplates,
    // 型別感知的 lint：no-uncalled-signals 這類規則需要看得到型別資訊。
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' }
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' }
      ],

      // ── 鐵律的機器版（見 CLAUDE.md「Angular 語法」）──
      // constructor 參數注入 → inject()
      '@angular-eslint/prefer-inject': 'error',
      // @Input()/@Output()/@ViewChild() → input()/output()/viewChild()
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      // @HostBinding/@HostListener → host metadata
      '@angular-eslint/prefer-host-metadata-property': 'error',
      // output 名稱不得與 DOM 原生事件同名（會靜默退回原生監聽）
      '@angular-eslint/no-output-native': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      // 忘了加 () 的 signal 永遠是 truthy，而且編譯期不會抱怨
      '@angular-eslint/no-uncalled-signals': 'error',
      // 手動 subscribe() 一律要 takeUntilDestroyed()
      '@angular-eslint/no-implicit-take-until-destroyed': 'error',
      '@angular-eslint/no-forward-ref': 'error',
      '@angular-eslint/consistent-component-styles': 'error',

      // 型別匯入一律標 type，讓 verbatimModuleSyntax 不會在建置時才抱怨
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }]
    }
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // 鐵律：禁止 *ngIf / *ngFor / *ngSwitch，改用 @if / @for / @switch
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-at-empty': 'error',
      '@angular-eslint/template/prefer-contextual-for-variables': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
      '@angular-eslint/template/no-duplicate-attributes': 'error',
      '@angular-eslint/template/attributes-order': 'error',
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/button-has-type': 'error',
      // 鐵律：禁止 inline style。[style.x] 綁定是動態值，不在此列。
      '@angular-eslint/template/no-inline-styles': ['error', { allowBindToStyle: true }]
    }
  },

  // ── 邊界規則（見 CLAUDE.md「邊界」）──
  // 同一個 feature 內部一律用相對路徑，因此在 feature 裡出現 @features/* 就是跨 feature import。
  {
    files: ['src/app/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@features/*'],
              message: 'feature 之間禁止互相 import。同一個 feature 內部請用相對路徑。'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@features/*'], message: 'core 禁止 import feature。' }]
        }
      ]
    }
  },
  {
    files: ['src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@features/*', '@core/*'],
              message: 'shared 禁止 import feature 與 core，依賴只能往更通用的方向流。'
            }
          ]
        }
      ]
    }
  }
]);
