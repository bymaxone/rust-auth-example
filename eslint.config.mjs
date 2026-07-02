import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/build',
      '**/.next',
      '**/coverage',
      '**/node_modules',
      '**/target',
      '**/.sibling-rust-auth',
      '**/.sibling-rust-auth/**',
      '**/*.d.ts',
      '**/.stryker-tmp',
      '**/reports/mutation',
    ],
  },
  js.configs.recommended,
  {
    // Plain JavaScript files (config scripts, ESM/CJS helpers) need Node globals
    // declared explicitly because the TypeScript block below only covers *.ts files.
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // A dedicated program (not `projectService`) so the typed rules resolve
        // `@bymax-one/rust-auth/*` through the sibling library's TypeScript
        // source rather than its built `dist`. The `dist` is git-ignored and is
        // only materialised for the jobs that download the build artifact, so
        // without this the type-checked lint would see the imports as `any` and
        // report false `no-unsafe-*` violations. `tsconfig.eslint.json` layers
        // the source `paths` on top of the app config used by `tsc`/`next build`,
        // which stay untouched.
        project: ['./apps/web/tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow intentionally unused parameters/variables prefixed with `_` — the
      // standard TypeScript convention for structurally-required-but-unused names.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  prettier,
);
