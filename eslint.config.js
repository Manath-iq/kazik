import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/worker-configuration.d.ts', '**/.wrangler/**', '.local/**', 'vendor/**', 'tools/art/**'] },
  { files: ['tools/**/*.mjs'], languageOptions: { globals: { console: 'readonly', URL: 'readonly', fetch: 'readonly' } } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error' } },
);
