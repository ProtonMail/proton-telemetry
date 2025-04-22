import prettier from 'eslint-plugin-prettier';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
    {
        files: ['**/*.ts', '**/*.tsx'],
        plugins: {
            '@typescript-eslint': tseslint,
            prettier: prettier,
        },
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            'prettier/prettier': 'error',
            ...tseslint.configs['recommended'].rules,
        },
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        plugins: {
            prettier: prettier,
        },
        rules: {
            'prettier/prettier': 'error',
        },
    },
    {
        ignores: ['dist/**', 'coverage/**'],
    },
];
