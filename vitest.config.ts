import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: './coverage',
        },
        setupFiles: ['./src/__tests__/setup.ts'],
    },
});
