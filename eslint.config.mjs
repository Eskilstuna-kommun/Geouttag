// eslint.config.mjs

import globals from 'globals';
import { configs, extensions, plugins } from 'eslint-config-airbnb-extended';

export default [
  plugins.importX,
  plugins.node,
  plugins.stylistic,
  ...extensions.base.recommended,
  ...configs.base.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        Origo: 'readonly'
      }
    },

    rules: {
      'comma-dangle': 'off',
      '@stylistic/comma-dangle': ['error', 'never'],
      'linebreak-style': ['error', 'unix'],
      'import-x/no-unresolved': 'off',
      'import-x/no-rename-default': 'off',
      'new-cap': 'off',
      'prefer-destructuring': 'off',
      'max-len': 'off',
      '@stylistic/max-len': 'off',
      'no-alert': 'off',
      'prefer-object-spread': 'off',
      'object-curly-newline': 'off',
      'arrow-parens': 'off',
      '@stylistic/arrow-parens': 'off',

      'no-else-return': [
        'error',
        {
          allowElseIf: true
        }
      ],

      'no-console': [
        'error',
        {
          allow: ['warn', 'error']
        }
      ],

      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['tasks/**'],
          optionalDependencies: false
        }
      ]
    }
  }
];
