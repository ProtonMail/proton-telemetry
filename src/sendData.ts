import type {
    EventData,
    EventPriority,
    EventType,
    QueuedEvent,
    SendDataConfig,
    TelemetryEvent,
} from './types';
import { fetchWithHeaders } from './utils';
import { BATCH_DELAY, MAX_RETRIES } from './constants';
import { log, logError } from './utils';

interface SendDataState {
    eventQueue: QueuedEvent[];
    batchTimeout: NodeJS.Timeout | null;
    retryCount: number;
}

interface SendDataDependencies {
    createEventPayload: (
        eventType: EventType,
        eventData?: EventData,
        customData?: Record<string, unknown>,
    ) => TelemetryEvent;
}

export function createSendData(
    config: SendDataConfig,
    state: SendDataState,
    deps: SendDataDependencies,
) {
    async function sendBatch(
        eventsToProcess?: TelemetryEvent[],
    ): Promise<boolean> {
        let itemsForThisBatch: TelemetryEvent[];
        const isRetryAttempt = !!eventsToProcess;

        if (isRetryAttempt) {
            itemsForThisBatch = eventsToProcess!; // Use the events passed for retry
        } else {
            const splicedQueuedEvents = state.eventQueue.splice(
                0,
                state.eventQueue.length,
            );
            itemsForThisBatch = splicedQueuedEvents.map((qe) => qe.event);
        }

        if (itemsForThisBatch.length === 0) {
            // No events were spliced or provided for retry
            return true;
        }

        try {
            const response = await fetchWithHeaders(
                config.endpoint,
                config.appVersion,
                config.uidHeader,
                {
                    method: 'POST',
                    body: JSON.stringify({ events: itemsForThisBatch }),
                    keepalive: true,
                },
            );

            if (response.ok) {
                if (config.debug && state.retryCount > 0 && isRetryAttempt) {
                    log(config.debug, 'Batch sent successfully after retries.');
                }
                // Queue was already modified by splice. Reset retryCount if this was a successful retry.
                if (isRetryAttempt) state.retryCount = 0;
                return true;
            }

            const retryAfterHeader = response.headers.get('retry-after');
            const canRetry =
                (response.status === 429 || response.status === 503) &&
                retryAfterHeader;

            if (canRetry) {
                const delaySeconds = parseInt(retryAfterHeader, 10);
                const delayMs =
                    !isNaN(delaySeconds) && delaySeconds >= 0
                        ? delaySeconds * 1000
                        : null;

                if (delayMs !== null && state.retryCount < MAX_RETRIES) {
                    state.retryCount++;
                    if (config.debug) {
                        log(
                            config.debug,
                            `Server responded with ${response.status}. Retrying after ${delayMs}ms (attempt #${state.retryCount}) based on Retry-After header.`,
                        );
                    }
                    setTimeout(() => {
                        // retry with the same (spliced) itemsForThisBatch
                        void sendBatch(itemsForThisBatch);
                    }, delayMs);
                    return false;
                } else {
                    // Max retries reached or invalid Retry-After header
                    if (config.debug) {
                        if (delayMs === null) {
                            log(
                                config.debug,
                                `Server responded with ${response.status} but invalid Retry-After header ('${retryAfterHeader}'). Dropping events.`,
                            );
                        } else {
                            logError(
                                config.debug,
                                `Max retries (${MAX_RETRIES}) reached after ${response.status} response. Dropping events.`,
                            );
                        }
                    }
                    // Events were already spliced, already dropped.
                    state.retryCount = 0;
                    return false;
                }
            } else {
                // Status is not 429/503 or Retry-After header is missing: do not retry
                if (config.debug) {
                    logError(
                        config.debug,
                        `Server responded with status ${response.status} without a valid Retry-After header. Dropping events.`,
                    );
                }
                // Events were already spliced, already dropped.
                state.retryCount = 0;
                return false;
            }
        } catch (error) {
            // Do not retry on network errors
            if (config.debug) {
                logError(
                    config.debug,
                    'Network error occurred. Dropping events.',
                    error,
                );
            }
            // Events were already spliced, already dropped.
            state.retryCount = 0;
            return false;
        }
    }

    async function sendData(
        eventType: EventType,
        eventData?: EventData,
        customData?: Record<string, unknown>,
        priority: EventPriority = 'high',
    ): Promise<boolean> {
        const event = deps.createEventPayload(eventType, eventData, customData);

        if (config.dryRun) {
            log(config.debug, '[DRY RUN] event:', event);
            return true;
        }

        state.eventQueue.push({ event, priority });

        if (state.batchTimeout === null && state.retryCount === 0) {
            // Only schedule a new batch if one isn't already pending or retrying
            return new Promise((resolve) => {
                state.batchTimeout = setTimeout(async () => {
                    state.batchTimeout = null; // Clear timeout before sending
                    resolve(await sendBatch());
                }, BATCH_DELAY);
            });
        } else {
            // An existing batch timeout or retry is in progress.
            // The event is queued and will be picked up when sendBatch is next called without args.
            return Promise.resolve(true); // Indicate event was queued
        }
    }

    return sendData;
}
