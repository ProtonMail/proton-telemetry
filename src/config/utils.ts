import type { TelemetryConfig } from '../types/index.ts';
import { defaultConfig } from './defaultConfig.ts';

export const createConfig = (
    userConfig: TelemetryConfig,
): Required<TelemetryConfig> =>
    ({
        ...defaultConfig,
        ...userConfig,
        events: {
            ...defaultConfig.events,
            ...userConfig.events,
        },
        urlSanitization: userConfig.urlSanitization
            ? {
                  ...defaultConfig.urlSanitization,
                  ...userConfig.urlSanitization,
              }
            : defaultConfig.urlSanitization,
    }) as Required<TelemetryConfig>;
