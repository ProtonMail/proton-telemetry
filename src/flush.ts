import type { QueuedEvent } from './types';
import { fetchWithHeaders } from './utils';

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

    if (navigator.sendBeacon) {
        try {
            const blob = new Blob([body], { type: 'application/json' });
            const success = navigator.sendBeacon(endpoint, blob);
            if (success) {
                eventQueue.length = 0;
                return;
            }
        } catch {
            // fall back to fetchWithHeaders
        }
    }

    if (eventQueue.length > 0) {
        try {
            await fetchWithHeaders(endpoint, appVersion, uidHeader, {
                method: 'POST',
                body,
                keepalive: true,
            });
            eventQueue.length = 0;
        } catch {
            // fail silently
        }
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
