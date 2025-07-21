import type { TelemetryConfig } from '../types';

export const defaultConfig: Partial<TelemetryConfig> = {
    debug: false,
    dryRun: false,
    pageTitle: undefined,
    telemetryEnabled: true,
    events: {
        pageView: true,
        click: true,
        form: false,
        performance: true,
        visibility: true,
        modal: false,
    },
};
