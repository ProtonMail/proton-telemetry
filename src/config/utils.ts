import type { TelemetryConfig } from '../types';
import { defaultConfig } from './defaultConfig';

export const createConfig = (
    userConfig: TelemetryConfig
): Required<TelemetryConfig> =>
    ({
        ...defaultConfig,
        ...userConfig,
        events: {
            ...defaultConfig.events,
            ...userConfig.events,
        },
    } as Required<TelemetryConfig>);
