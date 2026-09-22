import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_DELAY, PENDING_EVENTS_KEY } from '../constants.ts';
import { createPendingEventsStore } from '../pendingEvents.ts';
import { createTelemetry } from '../telemetry.ts';
import type { TelemetryEvent } from '../types/index.ts';
import {
    createFetchMock,
    createSessionStorageMock,
    setupBasicTelemetryTest,
} from './helpers/index.ts';
import { createBasicTelemetryConfig } from './helpers/fixtures.ts';

describe('send data persistence', () => {
    let mockFetch: ReturnType<typeof createFetchMock>;
    let sessionStorageMock: ReturnType<typeof createSessionStorageMock>;

    const readPendingEvent = (eventType: string): TelemetryEvent => {
        const { entries } = JSON.parse(
            sessionStorageMock.getItem(PENDING_EVENTS_KEY)!,
        ) as { entries: Array<{ event: TelemetryEvent }> };
        const entry = entries.find(
            ({ event }) => event.eventType === eventType,
        );
        expect(entry).toBeDefined();
        return entry!.event;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        setupBasicTelemetryTest();
        sessionStorageMock = createSessionStorageMock();
        vi.stubGlobal('sessionStorage', sessionStorageMock);
        mockFetch = createFetchMock();
        let messageId = 0;
        vi.stubGlobal('crypto', {
            randomUUID: () => `message-${++messageId}`,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('persists a standard event before returning and before fetching', () => {
        const telemetry = createTelemetry(createBasicTelemetryConfig());

        telemetry.sendCustomEvent('first_event', { test: true });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(readPendingEvent('first_event')).toEqual(
            expect.objectContaining({ eventType: 'first_event' }),
        );
    });

    it('sends but does not persist events when a session header is configured', async () => {
        const telemetry = createTelemetry(
            createBasicTelemetryConfig({ uidHeader: 'session-uid' }),
        );

        telemetry.sendCustomEvent('session_event');
        expect(sessionStorageMock.getItem(PENDING_EVENTS_KEY)).toBeNull();

        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not persist a dry-run event', () => {
        const telemetry = createTelemetry(
            createBasicTelemetryConfig({ dryRun: true }),
        );

        telemetry.sendCustomEvent('dry_run_event');

        expect(sessionStorageMock.getItem(PENDING_EVENTS_KEY)).toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retains an event until its retry succeeds', async () => {
        mockFetch
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 429,
                    headers: { 'retry-after': '1' },
                }),
            )
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        const telemetry = createTelemetry(createBasicTelemetryConfig());

        telemetry.sendCustomEvent('retry_event');
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(createPendingEventsStore().read()).toEqual([
            expect.objectContaining({ eventType: 'retry_event' }),
        ]);

        await vi.advanceTimersByTimeAsync(1_000);

        expect(createPendingEventsStore().read()).toEqual([]);
    });

    it('retains an event after a non-ok response', async () => {
        mockFetch.mockResolvedValue(
            new Response(null, {
                status: 500,
                headers: { 'retry-after': '5' },
            }),
        );
        const telemetry = createTelemetry(createBasicTelemetryConfig());

        telemetry.sendCustomEvent('server_failure');
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(createPendingEventsStore().read()).toEqual([
            expect.objectContaining({ eventType: 'server_failure' }),
        ]);
    });

    it('retains an event after a network error', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        const telemetry = createTelemetry(createBasicTelemetryConfig());

        telemetry.sendCustomEvent('network_failure');
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(createPendingEventsStore().read()).toEqual([
            expect.objectContaining({ eventType: 'network_failure' }),
        ]);
    });
});
