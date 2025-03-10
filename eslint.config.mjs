import baseConfig from '@protonme/eslint-config';

export default [
    ...baseConfig,
    {
        ignores: ['coverage/**', '*.config.mjs', '*.config.ts'],
    },
];
