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

    const queuedEvents = eventQueue.splice(0, eventQueue.length);
    const batchedEvents = {
        events: queuedEvents.map((queuedEvent) => queuedEvent.event),
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
    } catch (error) {
        eventQueue.unshift(...queuedEvents);
        logError(
            debug,
            `Failed to flush ${batchedEvents.events.length} event(s) on page unload:`,
            error,
        );
    }
}

export function attachPageLifecycleFlush(
    flush: () => Promise<void>,
): () => void {
    const flushHandler = () => {
        void flush();
    };
    const visibilityChangeHandler = () => {
        if (document.visibilityState === 'hidden') {
            void flush();
        }
    };

    const canListenToWindow =
        typeof window !== 'undefined' &&
        typeof window.addEventListener === 'function';
    const canListenToDocument =
        typeof document !== 'undefined' &&
        typeof document.addEventListener === 'function';

    if (canListenToWindow) {
        window.addEventListener('pagehide', flushHandler);
    }
    if (canListenToDocument) {
        document.addEventListener('visibilitychange', visibilityChangeHandler);
    }

    return () => {
        try {
            if (canListenToWindow) {
                window.removeEventListener('pagehide', flushHandler);
            }
            if (canListenToDocument) {
                document.removeEventListener(
                    'visibilitychange',
                    visibilityChangeHandler,
                );
            }
        } catch {
            // ignore
        }
    };
}
