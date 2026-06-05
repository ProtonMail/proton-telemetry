export {
    createTelemetry as ProtonTelemetry,
    createCustomEventSender,
} from './telemetry.ts';

export type {
    CreateTelemetryReturn,
    CreateTelemetryType as ProtonTelemetryType,
} from './telemetry.ts';
export type {
    TelemetryConfig,
    CrossDomainStorageConfig,
    TelemetryEvent,
    EventType,
    CustomEventType,
    StandardEventType,
} from './types/index.ts';

// Singleton exports
export {
    getTelemetryInstance,
    ProtonTelemetrySingleton,
    destroyTelemetryInstance,
    getExistingTelemetryInstance,
    sendCustomEvent,
    sendPageView,
    setTelemetryEnabled,
} from './singleton.ts';
