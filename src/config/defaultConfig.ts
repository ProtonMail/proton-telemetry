import type { TelemetryConfig } from '../types/index.ts';

export const defaultConfig: Partial<TelemetryConfig> = {
    debug: false,
    dryRun: false,
    pageTitle: undefined,
    urlSanitization: { stripHash: true },
    telemetryEnabled: true,
    events: {
        pageView: false,
        click: false,
        form: false,
        performance: false,
        modal: false,
        exit: false,
    },
};
