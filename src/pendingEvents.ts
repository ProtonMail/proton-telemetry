import {
    PENDING_EVENTS_KEY,
    PENDING_EVENTS_MAX_COUNT,
    PENDING_EVENTS_VERSION,
    PENDING_EVENT_TTL_MS,
} from './constants.ts';
import type { TelemetryEvent } from './types/events.ts';
import { logWarn } from './utils/helpers.ts';

interface PendingEvent {
    event: TelemetryEvent;
    storedAt: number;
}

interface PendingEventsContainer {
    version: number;
    entries: PendingEvent[];
}

export interface PendingEventsStore {
    persist(event: TelemetryEvent): void;
    read(): TelemetryEvent[];
    remove(events: TelemetryEvent[]): void;
    clear(): void;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim() !== '';
}

// Only the pending events need to be checked
function isTelemetryEventEnvelope(value: unknown): value is TelemetryEvent {
    return (
        isObject(value) &&
        isNonEmptyString(value.zId) &&
        isNonEmptyString(value.messageId) &&
        isNonEmptyString(value.eventType) &&
        isObject(value.context) &&
        isObject(value.properties)
    );
}

function isPendingEvent(entry: unknown, now: number): entry is PendingEvent {
    if (!isObject(entry)) {
        return false;
    }

    const { event, storedAt } = entry;
    return (
        typeof storedAt === 'number' &&
        Number.isFinite(storedAt) &&
        storedAt <= now &&
        now - storedAt <= PENDING_EVENT_TTL_MS &&
        isTelemetryEventEnvelope(event)
    );
}

// A disabled store persists and restores nothing but still clears, so a
// privacy opt-out removes anything an earlier enabled instance left behind.
export function createPendingEventsStore(
    debug = false,
    enabled = true,
): PendingEventsStore {
    function normalize(entries: unknown[]): PendingEvent[] {
        const now = Date.now();
        return entries
            .filter((entry) => isPendingEvent(entry, now))
            .slice(-PENDING_EVENTS_MAX_COUNT);
    }

    function write(entries: PendingEvent[]): void {
        try {
            if (entries.length === 0) {
                sessionStorage.removeItem(PENDING_EVENTS_KEY);
            } else {
                const container: PendingEventsContainer = {
                    version: PENDING_EVENTS_VERSION,
                    entries,
                };
                sessionStorage.setItem(
                    PENDING_EVENTS_KEY,
                    JSON.stringify(container),
                );
            }
        } catch (error) {
            logWarn(debug, 'Unable to write pending events', error);
        }
    }

    function readEntries(): PendingEvent[] {
        let value: string | null;
        try {
            value = sessionStorage.getItem(PENDING_EVENTS_KEY);
        } catch (error) {
            logWarn(debug, 'Unable to read pending events', error);
            return [];
        }
        if (value === null) {
            return [];
        }

        try {
            const container: unknown = JSON.parse(value);
            if (
                isObject(container) &&
                container.version === PENDING_EVENTS_VERSION &&
                Array.isArray(container.entries)
            ) {
                const normalized = normalize(container.entries);
                if (normalized.length !== container.entries.length) {
                    write(normalized);
                }
                return normalized;
            }
        } catch (error) {
            logWarn(debug, 'Unable to read pending events', error);
        }

        // Malformed, unversioned or stale-version container: discard it.
        write([]);
        return [];
    }

    return {
        persist(event: TelemetryEvent): void {
            if (!enabled) {
                return;
            }

            write(
                normalize([...readEntries(), { event, storedAt: Date.now() }]),
            );
        },

        read(): TelemetryEvent[] {
            return enabled ? readEntries().map((entry) => entry.event) : [];
        },

        remove(events: TelemetryEvent[]): void {
            write(
                readEntries().filter(
                    ({ event }) =>
                        !events.some(
                            (requested) =>
                                requested.zId === event.zId &&
                                requested.messageId === event.messageId,
                        ),
                ),
            );
        },

        clear(): void {
            write([]);
        },
    };
}
