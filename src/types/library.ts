import type { TelemetryEvent } from './events';

export interface TelemetryConfig {
    endpoint: string;
    appVersion: string;
    debug?: boolean;
    dryRun?: boolean;
    uidHeader?: string;
    pageTitle?: string;
    telemetryEnabled?: boolean;
    crossDomain?: CrossDomainStorageConfig;
    events?: {
        pageView?: boolean;
        click?: boolean;
        form?: boolean;
        performance?: boolean;
        visibility?: boolean;
        modal?: boolean;
    };
}
export interface SendDataConfig {
    debug: boolean;
    dryRun: boolean;
    endpoint: string;
    appVersion: string;
    uidHeader?: string;
}

export interface BatchedTelemetryEvents {
    events: TelemetryEvent[];
}

export type EventPriority = 'high' | 'low';

export interface QueuedEvent {
    event: TelemetryEvent;
    priority: EventPriority;
}

export interface CrossDomainStorageConfig {
    cookieName?: string;
    maxAge?: number; // in seconds
}
