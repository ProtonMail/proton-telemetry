import type {
    EventData,
    EventPriority,
    EventType,
    QueuedEvent,
    TelemetryEvent,
} from './types';
import { fetchWithHeaders } from './utils';
import { BATCH_DELAY, MAX_RETRIES } from './constants';

interface SendDataConfig {
    debug: boolean;
    dryRun: boolean;
    endpoint: string;
    appVersion: string;
    uidHeader?: string;
}

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
    async function sendBatch(): Promise<boolean> {
        try {
            const response = await fetchWithHeaders(
                config.endpoint,
                config.appVersion,
                config.uidHeader,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        events: state.eventQueue.map(
                            (queuedEvent) => queuedEvent.event,
                        ),
                    }),
                    keepalive: true,
                },
            );

            if (response.ok) {
                if (config.debug && state.retryCount > 0) {
                    console.log(
                        '[Telemetry] Batch sent successfully after retries.',
                    );
                }
                state.eventQueue = [];
                state.retryCount = 0;
                return true;
            }

            // --- Retry Logic Update ---
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
                        console.log(
                            `[Telemetry] Server responded with ${response.status}. Retrying after ${delayMs}ms (attempt #${state.retryCount}) based on Retry-After header.`,
                        );
                    }
                    setTimeout(() => {
                        void sendBatch();
                    }, delayMs);
                    return false;
                } else {
                    // Max retries reached or invalid Retry-After header
                    if (config.debug) {
                        if (delayMs === null) {
                            console.error(
                                `[Telemetry] Server responded with ${response.status} but invalid Retry-After header ('${retryAfterHeader}'). Dropping events.`,
                            );
                        } else {
                            console.error(
                                `[Telemetry] Max retries (${MAX_RETRIES}) reached after ${response.status} response. Dropping events.`,
                            );
                        }
                    }
                    // Drop events
                    state.eventQueue = [];
                    state.retryCount = 0;
                    return false;
                }
            } else {
                // Status is not 429/503 or Retry-After header is missing: do not retry
                if (config.debug) {
                    console.error(
                        `[Telemetry] Server responded with status ${response.status} without a valid Retry-After header. Dropping events.`,
                    );
                }
                // Drop events
                state.eventQueue = [];
                state.retryCount = 0;
                return false;
            }
        } catch (error) {
            // Do not retry on network errors
            if (config.debug) {
                console.error(
                    '[Telemetry] Network error occurred. Dropping events.',
                    error,
                );
            }
            state.eventQueue = [];
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
            // eslint-disable-next-line no-console
            console.log('[DRY RUN] event:', event);
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
            // The promise resolves based on the outcome of that existing operation.
            // This might be slightly unintuitive, as the promise resolves based on the previous batch's success/failure.
            return Promise.resolve(true); // Indicate event was queued
        }
    }

    return sendData;
}
