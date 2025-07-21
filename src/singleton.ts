import { createTelemetry, type CreateTelemetryReturn } from './telemetry';
import type { TelemetryConfig } from './types';

const GLOBAL_TELEMETRY_KEY = '__PROTON_TELEMETRY_INSTANCE__';

declare global {
    var __PROTON_TELEMETRY_INSTANCE__:
        | {
              instance: CreateTelemetryReturn;
              config: TelemetryConfig;
          }
        | undefined;
}

function getGlobalStorage() {
    try {
        if (typeof globalThis !== 'undefined') return globalThis;
        if (typeof window !== 'undefined') return window;
        if (typeof global !== 'undefined') return global;
        throw new Error(
            'Unable to access global object for telemetry singleton',
        );
    } catch (error) {
        console.warn('[Telemetry] Unable to access global storage:', error);
        return null;
    }
}

// Create a no-op telemetry instance that safely ignores all calls
function createNoOpTelemetry(): CreateTelemetryReturn {
    const noOp = () => {};
    const asyncNoOp = async () => {};

    return {
        sendPageView: noOp,
        sendClicks: noOp,
        sendForms: noOp,
        sendModalView: noOp,
        sendCustomEvent: noOp,
        setTelemetryEnabled: noOp,
        destroy: asyncNoOp,
    };
}

// Gets or creates the singleton telemetry instance.
// Only one instance can exist at a time across the entire application.
export function getTelemetryInstance(
    config: TelemetryConfig,
): CreateTelemetryReturn {
    const globalStorage = getGlobalStorage();

    if (!globalStorage) {
        console.warn(
            '[Telemetry] Global storage unavailable. Using no-op telemetry instance.',
        );
        return createNoOpTelemetry();
    }

    const existing = globalStorage[GLOBAL_TELEMETRY_KEY];

    if (existing) {
        // Warn if trying to initialize with different config
        if (JSON.stringify(existing.config) !== JSON.stringify(config)) {
            console.warn(
                '[Telemetry] Singleton already initialized with different config. Using existing instance.',
            );
        }
        return existing.instance;
    }

    // Create new singleton instance
    const instance = createTelemetry(config);

    // Wrap destroy to clean up singleton
    const originalDestroy = instance.destroy;
    const enhancedInstance = {
        ...instance,
        destroy: async () => {
            await originalDestroy();
            delete globalStorage[GLOBAL_TELEMETRY_KEY];
        },
    };

    globalStorage[GLOBAL_TELEMETRY_KEY] = {
        instance: enhancedInstance,
        config: { ...config },
    };

    return enhancedInstance;
}

// Convenience function - same as getTelemetryInstance
export function ProtonTelemetrySingleton(
    config: TelemetryConfig,
): CreateTelemetryReturn {
    return getTelemetryInstance(config);
}

// Destroys the singleton telemetry instance if it exists
export async function destroyTelemetryInstance(): Promise<void> {
    const globalStorage = getGlobalStorage();

    if (!globalStorage) {
        return;
    }

    const existing = globalStorage[GLOBAL_TELEMETRY_KEY];

    if (existing) {
        await existing.instance.destroy();
    }
}

// Gets the existing telemetry instance without creating one
export function getExistingTelemetryInstance(): CreateTelemetryReturn | null {
    const globalStorage = getGlobalStorage();

    if (!globalStorage) {
        return null;
    }

    const existing = globalStorage[GLOBAL_TELEMETRY_KEY];
    return existing?.instance || null;
}

// Sends a custom event using the existing telemetry instance.
// If no instance exists, the event is ignored with a warning.
export function sendCustomEvent(
    eventType: string,
    customData?: Record<string, unknown>,
): void {
    const instance = getExistingTelemetryInstance();

    if (instance) {
        instance.sendCustomEvent(eventType, customData);
    } else {
        console.warn(
            '[Telemetry] No telemetry instance available. Call ProtonTelemetrySingleton() first.',
        );
    }
}

// Sends a page view using the existing telemetry instance
export function sendPageView(): void {
    const instance = getExistingTelemetryInstance();

    if (instance) {
        instance.sendPageView();
    } else {
        console.warn(
            '[Telemetry] No telemetry instance available. Call ProtonTelemetrySingleton() first.',
        );
    }
}

// Sets telemetry enabled state using the existing telemetry instance
export function setTelemetryEnabled(enabled: boolean): void {
    const instance = getExistingTelemetryInstance();

    if (instance) {
        instance.setTelemetryEnabled(enabled);
    } else {
        console.warn(
            '[Telemetry] No telemetry instance available. Call ProtonTelemetrySingleton() first.',
        );
    }
}
