export {
    createTelemetry as ProtonTelemetry,
    createCustomEventSender,
} from './telemetry';

export type {
    CreateTelemetryReturn,
    CreateTelemetryType as ProtonTelemetryType,
} from './telemetry';
export type {
    TelemetryConfig,
    CrossDomainStorageConfig,
    TelemetryEvent,
    EventType,
    CustomEventType,
    StandardEventType,
} from './types';

// Singleton exports
export {
    getTelemetryInstance,
    ProtonTelemetrySingleton,
    destroyTelemetryInstance,
    getExistingTelemetryInstance,
    sendCustomEvent,
    sendPageView,
} from './singleton';
