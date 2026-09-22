import type {
    EventData,
    EventPriority,
    EventType,
    QueuedEvent,
    SendDataConfig,
    TelemetryEvent,
} from './types/index.ts';
import type { PendingEventsStore } from './pendingEvents.ts';
import { fetchWithHeaders } from './utils/index.ts';
import { BATCH_DELAY, MAX_RETRIES } from './constants.ts';
import { log, logError } from './utils/index.ts';

interface SendDataState {
    eventQueue: QueuedEvent[];
    batchTimeout: NodeJS.Timeout | null;
}

interface SendDataDependencies {
    pendingEvents: PendingEventsStore;
    shouldSend: () => boolean;
    createEventPayload: (
        eventType: EventType,
        eventData?: EventData,
        customData?: Record<string, unknown>,
    ) => TelemetryEvent;
}

interface SendBatchOptions {
    keepalive?: boolean;
    retryCount?: number;
    generation?: number;
}

export function createSendData(
    config: SendDataConfig,
    state: SendDataState,
    deps: SendDataDependencies,
) {
    const retryTimeouts = new Set<NodeJS.Timeout>();
    let retryGeneration = 0;

    async function sendBatch(
        eventsToProcess?: TelemetryEvent[],
        options: SendBatchOptions = {},
    ): Promise<boolean> {
        if (!deps.shouldSend()) {
            return false;
        }

        const {
            keepalive = true,
            retryCount = 0,
            generation = retryGeneration,
        } = options;
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
                    keepalive,
                },
            );

            if (generation !== retryGeneration) {
                return false;
            }

            if (response.ok) {
                deps.pendingEvents.remove(itemsForThisBatch);
                if (config.debug && retryCount > 0 && isRetryAttempt) {
                    log(config.debug, 'Batch sent successfully after retries.');
                }
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

                if (delayMs !== null && retryCount < MAX_RETRIES) {
                    const nextRetryCount = retryCount + 1;
                    if (config.debug) {
                        log(
                            config.debug,
                            `Server responded with ${response.status}. Retrying after ${delayMs}ms (attempt #${nextRetryCount}) based on Retry-After header.`,
                        );
                    }
                    const retryTimeout = setTimeout(() => {
                        retryTimeouts.delete(retryTimeout);
                        if (generation !== retryGeneration) {
                            return;
                        }
                        // retry with the same (spliced) itemsForThisBatch
                        void sendBatch(itemsForThisBatch, {
                            keepalive,
                            retryCount: nextRetryCount,
                            generation,
                        });
                    }, delayMs);
                    retryTimeouts.add(retryTimeout);
                    return false;
                } else {
                    // Max retries reached or invalid Retry-After header
                    if (config.debug) {
                        if (delayMs === null) {
                            log(
                                config.debug,
                                `Server responded with ${response.status} but invalid Retry-After header ('${retryAfterHeader}'). Events remain persisted.`,
                            );
                        } else {
                            logError(
                                config.debug,
                                `Max retries (${MAX_RETRIES}) reached after ${response.status} response. Events remain persisted.`,
                            );
                        }
                    }
                    // Events were already spliced but remain persisted.
                    return false;
                }
            } else {
                // Status is not 429/503 or Retry-After header is missing: do not retry
                if (config.debug) {
                    logError(
                        config.debug,
                        `Server responded with status ${response.status} without a valid Retry-After header. Events remain persisted.`,
                    );
                }
                // Events were already spliced but remain persisted.
                return false;
            }
        } catch (error) {
            if (generation !== retryGeneration) {
                return false;
            }

            // Do not retry on network errors
            if (config.debug) {
                logError(
                    config.debug,
                    'Network error occurred. Events remain persisted.',
                    error,
                );
            }
            // Events were already spliced but remain persisted.
            return false;
        }
    }

    async function sendData(
        eventType: EventType,
        eventData?: EventData,
        customData?: Record<string, unknown>,
        priority: EventPriority = 'low',
    ): Promise<boolean> {
        const event = deps.createEventPayload(eventType, eventData, customData);

        if (config.dryRun) {
            log(config.debug, '[DRY RUN] event:', event);
            return true;
        }

        deps.pendingEvents.persist(event);
        state.eventQueue.push({ event, priority });

        // Send immediately for high-priority events
        if (priority === 'high') {
            if (state.batchTimeout !== null) {
                clearTimeout(state.batchTimeout);
                state.batchTimeout = null;
            }
            return await sendBatch();
        }

        if (state.batchTimeout === null) {
            // Only schedule a new batch if one isn't already pending
            return new Promise((resolve) => {
                state.batchTimeout = setTimeout(async () => {
                    state.batchTimeout = null; // Clear timeout before sending
                    resolve(await sendBatch());
                }, BATCH_DELAY);
            });
        } else {
            // An existing batch timeout is in progress.
            // The event is queued and will be picked up when sendBatch is next called without args.
            return Promise.resolve(true); // Indicate event was queued
        }
    }

    function cancelPendingSends(): void {
        retryGeneration++;
        retryTimeouts.forEach(clearTimeout);
        retryTimeouts.clear();
        if (state.batchTimeout !== null) {
            clearTimeout(state.batchTimeout);
            state.batchTimeout = null;
        }
    }

    return { sendData, sendBatch, cancelPendingSends };
}
