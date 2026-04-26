import js from '@eslint/js';
export default [
  js.configs.recommended,
  {
    languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
    rules: {
      'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      'eqeqeq': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-trailing-spaces': 'error'
    }
  }
];
