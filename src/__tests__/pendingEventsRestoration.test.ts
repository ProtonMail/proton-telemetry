import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_EVENTS_KEY, PENDING_EVENTS_VERSION } from '../constants.ts';
import { createTelemetry } from '../telemetry.ts';
import type { TelemetryEvent } from '../types/index.ts';
import {
    createFetchMock,
    createSessionStorageMock,
    setupBasicTelemetryTest,
} from './helpers/index.ts';
import { createBasicTelemetryConfig } from './helpers/fixtures.ts';

const pendingEvent: TelemetryEvent = {
    zId: 'stored-z-id',
    messageId: 'stored-message-id',
    clientEventTimestampUtc: '2026-09-10T10:00:00.000Z',
    clientEventTimestampLocal: '2026-09-10T12:00:00.000+02:00',
    eventType: 'stored_event',
    context: {
        campaign: {
            name: 'campaign',
            source: 'source',
            medium: 'medium',
            term: 'term',
            content: 'content',
        },
        library: { name: 'proton-telemetry', version: '1.0.0' },
        browserLocale: 'en-US',
        page: {
            title: 'Stored page',
            url: 'https://stored.example/path',
            path: '/path',
            referrer: 'https://referrer.example',
            queryString: '',
            queryParams: {},
        },
        referrer: {
            type: 'external',
            name: 'referrer',
            url: 'https://referrer.example',
        },
        screen: { width: 1920, height: 1080, density: 1 },
        timezone: 'Europe/Zurich',
        userAgent: 'stored-agent',
        features: { experiment: 'control' },
    },
    properties: { stored: true, nested: { value: 1 } },
};

const successfulResponse = () => new Response(null, { status: 200 });
const requestEvents = (
    mockFetch: ReturnType<typeof createFetchMock>,
    call: number,
) => JSON.parse(mockFetch.mock.calls[call]![1].body).events; // nosemgrep: gitlab.eslint.detect-object-injection
const settleRequest = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('pending event restoration', () => {
    let mockFetch: ReturnType<typeof createFetchMock>;
    let sessionStorageMock: ReturnType<typeof createSessionStorageMock>;
    let randomUUID: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        setupBasicTelemetryTest();
        sessionStorageMock = createSessionStorageMock({
            [PENDING_EVENTS_KEY]: JSON.stringify({
                version: PENDING_EVENTS_VERSION,
                entries: [{ event: pendingEvent, storedAt: Date.now() }],
            }),
        });
        vi.stubGlobal('sessionStorage', sessionStorageMock);
        mockFetch = createFetchMock();
        randomUUID = vi.fn(() => 'rebuilt-message-id');
        vi.stubGlobal('crypto', { randomUUID });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('sends stored events unchanged without keepalive and removes them after success', async () => {
        mockFetch.mockResolvedValue(successfulResponse());

        createTelemetry(createBasicTelemetryConfig());
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0]![1].keepalive).toBe(false);
        expect(requestEvents(mockFetch, 0)).toEqual([pendingEvent]);
        expect(randomUUID).not.toHaveBeenCalled();

        await settleRequest();
        expect(
            // Test-owned store and constant library key.
            // nosemgrep: gitlab.eslint.detect-object-injection
            sessionStorageMock._getStore()[PENDING_EVENTS_KEY],
        ).toBeUndefined();
    });

    it.each([
        [
            'a non-ok response',
            () => Promise.resolve(new Response(null, { status: 500 })),
        ],
        ['a network failure', () => Promise.reject(new Error('offline'))],
    ])(
        'leaves stored events after %s and retries them on a later initialization',
        async (_, firstRequest) => {
            mockFetch
                .mockImplementationOnce(firstRequest)
                .mockResolvedValueOnce(successfulResponse());

            const firstTelemetry = createTelemetry(
                createBasicTelemetryConfig(),
            );
            await settleRequest();

            expect(
                // Test-owned store and constant library key.
                // nosemgrep: gitlab.eslint.detect-object-injection
                sessionStorageMock._getStore()[PENDING_EVENTS_KEY],
            ).toBeDefined();
            await firstTelemetry.destroy();

            createTelemetry(createBasicTelemetryConfig());
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[1]![1].keepalive).toBe(false);
            expect(requestEvents(mockFetch, 1)).toEqual([pendingEvent]);
        },
    );

    it.each([429, 503])(
        'retries a restored batch after a %s response without keepalive or changed IDs',
        async (status) => {
            mockFetch
                .mockResolvedValueOnce(
                    new Response(null, {
                        status,
                        headers: { 'retry-after': '1' },
                    }),
                )
                .mockResolvedValueOnce(successfulResponse());

            createTelemetry(createBasicTelemetryConfig());
            await settleRequest();
            await vi.advanceTimersByTimeAsync(1_000);
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[0]![1].keepalive).toBe(false);
            expect(mockFetch.mock.calls[1]![1].keepalive).toBe(false);
            expect(requestEvents(mockFetch, 0)).toEqual([pendingEvent]);
            expect(requestEvents(mockFetch, 1)).toEqual([pendingEvent]);
        },
    );

    it('starts restoration before an automatic page view and keeps the batches separate', async () => {
        mockFetch.mockResolvedValue(successfulResponse());

        createTelemetry(
            createBasicTelemetryConfig({ events: { pageView: true } }),
        );
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0]![1].keepalive).toBe(false);
        expect(requestEvents(mockFetch, 0)).toEqual([pendingEvent]);
        expect(mockFetch.mock.calls[1]![1].keepalive).toBe(true);
        expect(requestEvents(mockFetch, 1)).toEqual([
            expect.objectContaining({ eventType: 'page_view' }),
        ]);
    });

    it('restores before emitting a new random uid event with initialized state', () => {
        setupBasicTelemetryTest({});
        randomUUID
            .mockReturnValueOnce('new-z-id')
            .mockReturnValueOnce('new-message-id');
        mockFetch.mockResolvedValue(successfulResponse());

        createTelemetry(createBasicTelemetryConfig());
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0]![1].keepalive).toBe(false);
        expect(requestEvents(mockFetch, 0)).toEqual([pendingEvent]);
        expect(mockFetch.mock.calls[1]![1].keepalive).toBe(true);
        expect(requestEvents(mockFetch, 1)).toEqual([
            expect.objectContaining({
                zId: 'new-z-id',
                messageId: 'new-message-id',
                eventType: 'random_uid_created',
                context: expect.objectContaining({ browserLocale: 'en-US' }),
            }),
        ]);
    });
    it('does not restore stored events when a session header is configured', async () => {
        mockFetch.mockResolvedValue(successfulResponse());

        createTelemetry(
            createBasicTelemetryConfig({ uidHeader: 'session-uid' }),
        );
        await settleRequest();

        expect(mockFetch).not.toHaveBeenCalled();
        expect(
            // Test-owned store and constant library key.
            // nosemgrep: gitlab.eslint.detect-object-injection
            sessionStorageMock._getStore()[PENDING_EVENTS_KEY],
        ).toBeDefined();
    });
});
