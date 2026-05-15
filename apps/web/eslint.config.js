// Flat-config eslint setup for the Vue 3 + TypeScript web app.
//
// `eslint-plugin-vue` brings the Vue-specific rules (template syntax,
// component lifecycle, recommended best practices) and
// `@vue/eslint-config-typescript` wires up typescript-eslint so .vue
// SFCs typecheck their <script setup lang="ts"> blocks through the
// same parser as the .ts files.
//
// We start from `flat/essential` (correctness rules, no style policing)
// and the default typescript-eslint recommended set. Strict-type rules
// would force a lot of refactors for marginal payoff on a UI codebase
// where most surface area is template logic — opt in case by case
// later if needed.

import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/dist-ssr/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/dev-dist/**',
      '**/*.d.ts',
    ],
  },
  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  {
    name: 'app/local-overrides',
    rules: {
      // The store / lib modules pass through computed types from
      // pinia + Vue's reactive() that the inferrer occasionally
      // widens to `any`; allow narrow opt-ins without forcing a
      // generic on every helper.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Composition helpers and Pinia store actions routinely have
      // intentionally-unused params (e.g. payload destructure). Strip
      // them with a leading underscore to suppress.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Single-word component names are unavoidable for view-level
      // components like `App.vue` or page-level views; relax the rule
      // instead of inventing prefixes.
      'vue/multi-word-component-names': 'off',
    },
  },
]
