import type { TelemetryConfig } from '../../types';

// Common telemetry configurations for testing
export const createBasicTelemetryConfig = (
    overrides: Partial<TelemetryConfig> = {},
): TelemetryConfig => ({
    endpoint: 'https://telemetry.test.com',
    appVersion: 'appVersion',
    debug: true,
    events: {
        pageView: false,
        click: false,
        form: false,
        performance: false,
        visibility: false,
        modal: false,
    },
    ...overrides,
});

export const createFullTelemetryConfig = (
    overrides: Partial<TelemetryConfig> = {},
): TelemetryConfig => ({
    endpoint: 'https://telemetry.test.com',
    appVersion: 'appVersion',
    debug: true,
    events: {
        pageView: true,
        click: true,
        form: true,
        performance: true,
        visibility: true,
        modal: true,
    },
    ...overrides,
});
