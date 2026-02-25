import type { TelemetryEvent } from './events';

export interface TelemetryConfig {
    /** The endpoint to send telemetry events to. */
    endpoint: string;
    /** The application version. */
    appVersion: string;
    /** Whether to enable debug logging. */
    debug?: boolean;
    /** Whether to enable dry run mode. */
    dryRun?: boolean;
    /** The header to use for the user ID. */
    uidHeader?: string;
    /** The title of the page to use in telemetry events (override with a static string when telemetry is used in a privacy-sensitive context) */
    pageTitle?: string;
    /** Whether to enable telemetry. Useful for integrating with user settings in the logged-in context. */
    telemetryEnabled?: boolean;
    /** Configuration for cross-domain tracking. */
    crossDomain?: CrossDomainStorageConfig;
    /** Configuration for URL sanitization. */
    urlSanitization?: UrlSanitizationConfig;
    /** Configuration for event sending. */
    events?: {
        pageView?: boolean;
        click?: boolean;
        form?: boolean;
        performance?: boolean;
        visibility?: boolean;
        modal?: boolean;
    };
}

export interface UrlSanitizationConfig {
    /** Strip the hash/fragment from all tracked URLs. Default: true */
    stripHash?: boolean;
    /**
     * Custom sanitizer applied to all URLs before they are included in
     * telemetry events. Receives a URL instance. Modify its properties
     * (pathname, search, hash, etc.) and return it, or return a new URL.
     * Applied after stripHash (if enabled).
     */
    sanitizeUrl?: (url: URL) => URL;
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
