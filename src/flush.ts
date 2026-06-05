import type { QueuedEvent } from './types/index.ts';
import { fetchWithHeaders, logError } from './utils/index.ts';

export async function flushQueue(
    endpoint: string,
    appVersion: string,
    uidHeader: string | undefined,
    debug: boolean,
    eventQueue: QueuedEvent[],
): Promise<void> {
    if (eventQueue.length === 0) return;

    const batchedEvents = {
        events: eventQueue.map((queuedEvent) => queuedEvent.event),
    };
    const body = JSON.stringify(batchedEvents);

    // Use fetch with keepalive rather than navigator.sendBeacon
    // because sendBeacon cannot set custom headers (x-pm-appversion)
    try {
        await fetchWithHeaders(endpoint, appVersion, uidHeader, {
            method: 'POST',
            body,
            keepalive: true,
        });
        eventQueue.length = 0;
    } catch (error) {
        logError(
            debug,
            `Failed to flush ${batchedEvents.events.length} event(s) on page unload:`,
            error,
        );
    }
}

export function attachPageHideFlush(flush: () => Promise<void>): () => void {
    if (
        typeof window !== 'undefined' &&
        'addEventListener' in window &&
        typeof window.addEventListener === 'function'
    ) {
        const handler = () => {
            void flush();
        };
        window.addEventListener('pagehide', handler);
        window.addEventListener('beforeunload', handler);
        return () => {
            try {
                window.removeEventListener('pagehide', handler);
                window.removeEventListener('beforeunload', handler);
            } catch {
                // ignore
            }
        };
    }

    return () => {};
}
