import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_DELAY, PENDING_EVENTS_KEY } from '../constants.ts';
import { createTelemetry } from '../telemetry.ts';
import {
    createFetchMock,
    createSessionStorageMock,
    setupBasicTelemetryTest,
} from './helpers/index.ts';
import { createBasicTelemetryConfig } from './helpers/fixtures.ts';

type PrivacySetting = 'telemetry disabled' | 'DNT' | 'GPC';

function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('pending event privacy', () => {
    const instances: Array<ReturnType<typeof createTelemetry>> = [];
    let mockFetch: ReturnType<typeof createFetchMock>;
    let sessionStorageMock: ReturnType<typeof createSessionStorageMock>;

    const createInstance = (
        overrides: Parameters<typeof createBasicTelemetryConfig>[0] = {},
    ) => {
        const telemetry = createTelemetry(
            createBasicTelemetryConfig({
                telemetryEnabled: true,
                ...overrides,
            }),
        );
        instances.push(telemetry);
        return telemetry;
    };
    const setPrivacy = (setting: PrivacySetting, enabled = true) => {
        if (setting === 'DNT') {
            Object.defineProperty(navigator, 'doNotTrack', {
                configurable: true,
                value: enabled ? '1' : null,
            });
        }
        if (setting === 'GPC') {
            Object.defineProperty(navigator, 'globalPrivacyControl', {
                configurable: true,
                value: enabled,
            });
        }
    };
    const pendingValue = () =>
        Reflect.get(sessionStorageMock._getStore(), PENDING_EVENTS_KEY);
    const pendingCalls = (calls: unknown[][]) =>
        calls.filter(([key]) => key === PENDING_EVENTS_KEY).length;
    const settleRequest = async () => {
        await Promise.resolve();
        await Promise.resolve();
    };

    beforeEach(() => {
        vi.useFakeTimers();
        setupBasicTelemetryTest();
        sessionStorageMock = createSessionStorageMock();
        vi.stubGlobal('sessionStorage', sessionStorageMock);
        mockFetch = createFetchMock();
        mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    });

    afterEach(async () => {
        await Promise.all(
            instances.splice(0).map((telemetry) => telemetry.destroy()),
        );
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([
        ['clears', false, 'telemetry disabled'],
        ['clears', false, 'DNT'],
        ['clears', false, 'GPC'],
        ['preserves', true, 'telemetry disabled'],
        ['preserves', true, 'DNT'],
        ['preserves', true, 'GPC'],
    ] as const)(
        '%s pending events when initialized with %s dry-run and %s',
        (expected, dryRun, setting) => {
            sessionStorageMock._setStore({
                [PENDING_EVENTS_KEY]: 'stored-pending-events',
            });
            setPrivacy(setting);

            createInstance({
                dryRun,
                telemetryEnabled: setting !== 'telemetry disabled',
            });

            const reads = pendingCalls(sessionStorageMock.getItem.mock.calls);
            const writes = pendingCalls(sessionStorageMock.setItem.mock.calls);
            const removals = pendingCalls(
                sessionStorageMock.removeItem.mock.calls,
            );
            expect(pendingValue()).toBe(
                dryRun ? 'stored-pending-events' : undefined,
            );
            expect(reads + writes).toBe(0);
            expect(removals).toBe(dryRun ? 0 : 1);
            expect(mockFetch).not.toHaveBeenCalled();
        },
    );

    it('immediately clears queued and retry work and re-enables only new events', async () => {
        mockFetch
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 429,
                    headers: { 'retry-after': '1' },
                }),
            )
            .mockResolvedValue(new Response(null, { status: 200 }));
        const telemetry = createInstance();

        telemetry.sendCustomEvent('retry_event');
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        telemetry.sendCustomEvent('queued_event');

        telemetry.setTelemetryEnabled(false);
        expect(pendingValue()).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
        telemetry.setTelemetryEnabled(true);
        telemetry.sendCustomEvent('new_event');
        await vi.advanceTimersByTimeAsync(BATCH_DELAY + 1_000);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(
            JSON.parse(mockFetch.mock.lastCall![1].body).events.map(
                ({ eventType }: { eventType: string }) => eventType,
            ),
        ).toEqual(['new_event']);
    });

    it.each([
        ['DNT', 'queued'],
        ['GPC', 'queued'],
        ['DNT', 'retry'],
        ['GPC', 'retry'],
    ] as const)(
        'clears %s-blocked %s work before its next send',
        async (setting, work) => {
            mockFetch.mockResolvedValue(
                new Response(null, {
                    status: 429,
                    headers: { 'retry-after': '1' },
                }),
            );
            const telemetry = createInstance();
            telemetry.sendCustomEvent(`${work}_event`);
            if (work === 'retry') {
                await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            }
            setPrivacy(setting);
            await vi.advanceTimersByTimeAsync(BATCH_DELAY + 1_000);
            expect(mockFetch).toHaveBeenCalledTimes(work === 'retry' ? 1 : 0);
            expect(pendingValue()).toBeUndefined();
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it('never retries an event whose request was in flight when DNT changed', async () => {
        const request = deferredResponse();
        mockFetch.mockImplementationOnce(() => request.promise);
        const telemetry = createInstance();
        telemetry.sendCustomEvent('in_flight');
        vi.advanceTimersByTime(BATCH_DELAY);
        await Promise.resolve();
        setPrivacy('DNT');

        request.reject(new Error('offline'));
        await settleRequest();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);

        // Nothing observed the DNT change yet, so the persisted event
        // remains until the next guarded operation clears it.
        telemetry.sendCustomEvent('after_change');
        expect(pendingValue()).toBeUndefined();
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['standard', '429 response', 'DNT'],
        ['lifecycle', 'fulfilled response', 'DNT'],
        ['lifecycle', 'rejected request', 'GPC'],
        ['destroy', '2xx response', 'DNT'],
        ['destroy', 'rejected request', 'GPC'],
    ] as const)(
        'makes an in-flight %s %s inert after %s changes',
        async (transport, outcome, setting) => {
            const request = deferredResponse();
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            mockFetch.mockImplementationOnce(() => request.promise);
            const telemetry = createInstance();
            telemetry.sendCustomEvent(`in_flight_${transport}`);
            if (transport !== 'lifecycle') {
                vi.advanceTimersByTime(BATCH_DELAY);
                await Promise.resolve();
            } else {
                window.dispatchEvent(new Event('pagehide'));
            }
            setPrivacy(setting);
            const readsBeforeContinuation = pendingCalls(
                sessionStorageMock.getItem.mock.calls,
            );
            if (transport === 'destroy') {
                await telemetry.destroy();
                expect(pendingValue()).toBeUndefined();
                expect(mockFetch).toHaveBeenCalledTimes(1);
            }
            if (outcome === 'rejected request') {
                request.reject(new Error('offline'));
            } else {
                request.resolve(
                    new Response(null, {
                        status: outcome === '429 response' ? 429 : 200,
                        headers: { 'retry-after': '1' },
                    }),
                );
            }
            await settleRequest();
            if (transport !== 'lifecycle') {
                await vi.advanceTimersByTimeAsync(1_000);
            }
            expect(pendingValue()).toBeUndefined();
            expect(pendingCalls(sessionStorageMock.removeItem.mock.calls)).toBe(
                1,
            );
            expect(pendingCalls(sessionStorageMock.getItem.mock.calls)).toBe(
                readsBeforeContinuation,
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(consoleError).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
            if (transport === 'lifecycle') {
                setPrivacy(setting, false);
                window.dispatchEvent(new Event('pagehide'));
                expect(mockFetch).toHaveBeenCalledTimes(1);
            }
        },
    );
});
