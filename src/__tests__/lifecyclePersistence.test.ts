import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_DELAY } from '../constants.ts';
import { createPendingEventsStore } from '../pendingEvents.ts';
import { createTelemetry } from '../telemetry.ts';
import type { TelemetryEvent } from '../types/index.ts';
import {
    createSessionStorageMock,
    setupBasicTelemetryTest,
} from './helpers/index.ts';
import { createBasicTelemetryConfig } from './helpers/fixtures.ts';

function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('lifecycle persistence and destroy cancellation', () => {
    const telemetryInstances: Array<ReturnType<typeof createTelemetry>> = [];
    let mockFetch: ReturnType<typeof vi.fn>;

    const createInstance = (
        events: Parameters<typeof createBasicTelemetryConfig>[0]['events'] = {},
    ) => {
        const telemetry = createTelemetry(
            createBasicTelemetryConfig({ events }),
        );
        telemetryInstances.push(telemetry);
        return telemetry;
    };
    const pendingEventTypes = () =>
        createPendingEventsStore()
            .read()
            .map(({ eventType }) => eventType);
    const requestEventTypes = (index: number) => {
        // The index is test-owned and only addresses recorded mock calls.
        const request = mockFetch.mock.calls[index]!; // nosemgrep: gitlab.eslint.detect-object-injection
        return (
            JSON.parse(request[1].body as string).events as TelemetryEvent[]
        ).map(({ eventType }) => eventType);
    };

    beforeEach(() => {
        vi.useFakeTimers();
        setupBasicTelemetryTest();
        vi.stubGlobal('sessionStorage', createSessionStorageMock());
        let messageId = 0;
        vi.stubGlobal('crypto', {
            randomUUID: () => `message-${++messageId}`,
        });
        mockFetch = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(async () => {
        await Promise.all(
            telemetryInstances
                .splice(0)
                .map((telemetry) => telemetry.destroy()),
        );
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('retains failed lifecycle batches and requeues thrown batches', async () => {
        mockFetch
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
            .mockRejectedValueOnce(new Error('offline'));
        const telemetry = createInstance();

        telemetry.sendCustomEvent('non_ok_event');
        window.dispatchEvent(new Event('pagehide'));
        await vi.advanceTimersByTimeAsync(0);

        telemetry.sendCustomEvent('thrown_event');
        window.dispatchEvent(new Event('pagehide'));
        await vi.advanceTimersByTimeAsync(0);

        expect(pendingEventTypes()).toEqual(['non_ok_event', 'thrown_event']);

        window.dispatchEvent(new Event('pagehide'));
        expect(requestEventTypes(2)).toEqual(['thrown_event']);
    });

    it('cancels queued standard work and flushes only the current queue on destroy', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(null, {
                status: 429,
                headers: { 'retry-after': '1' },
            }),
        );
        const telemetry = createInstance();

        telemetry.sendCustomEvent('retry_payload');
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        telemetry.sendCustomEvent('current_queue');

        const destroyPromise = telemetry.destroy();
        expect(vi.getTimerCount()).toBe(0);
        await destroyPromise;
        await vi.advanceTimersByTimeAsync(1_000);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(
            mockFetch.mock.calls.map((_, index) => requestEventTypes(index)),
        ).toEqual([['retry_payload'], ['current_queue']]);
        expect(pendingEventTypes()).toEqual(['retry_payload']);
    });

    it('does not acknowledge a late successful standard response after destroy', async () => {
        const request = deferredResponse();
        mockFetch.mockImplementationOnce(() => request.promise);
        const telemetry = createInstance();

        telemetry.sendCustomEvent('late_success');
        vi.advanceTimersByTime(BATCH_DELAY);
        await Promise.resolve();
        await telemetry.destroy();

        request.resolve(new Response(null, { status: 200 }));
        await Promise.resolve();
        await Promise.resolve();

        expect(pendingEventTypes()).toEqual(['late_success']);
    });

    it('retains a late rejected standard request after destroy', async () => {
        const request = deferredResponse();
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        mockFetch.mockImplementationOnce(() => request.promise);
        const telemetry = createInstance();

        telemetry.sendCustomEvent('late_rejection');
        vi.advanceTimersByTime(BATCH_DELAY);
        await Promise.resolve();
        await telemetry.destroy();

        request.reject(new Error('offline'));
        await vi.advanceTimersByTimeAsync(1_000);

        expect(pendingEventTypes()).toEqual(['late_rejection']);
        expect(consoleError).not.toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('detaches producers before awaiting the final destroy flush', async () => {
        const request = deferredResponse();
        const disconnect = vi.fn();
        class TestPerformanceObserver {
            observe = vi.fn();
            disconnect = disconnect;
        }
        vi.stubGlobal('PerformanceObserver', TestPerformanceObserver);
        Object.defineProperties(window, {
            PerformanceObserver: {
                configurable: true,
                value: TestPerformanceObserver,
            },
            PerformanceNavigationTiming: {
                configurable: true,
                value: class {},
            },
        });
        mockFetch.mockImplementationOnce(() => request.promise);
        const telemetry = createInstance({ exit: true, performance: true });

        telemetry.sendCustomEvent('final_queue');
        const destroyPromise = telemetry.destroy();
        window.dispatchEvent(new Event('pagehide'));

        expect(disconnect).toHaveBeenCalledOnce();
        request.resolve(new Response(null, { status: 200 }));
        await destroyPromise;
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(requestEventTypes(0)).toEqual(['final_queue']);
    });
});
