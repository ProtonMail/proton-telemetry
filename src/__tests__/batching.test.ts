import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import { BATCH_DELAY } from '../constants';

const FETCH_DELAY = 10;

describe('ProtonTelemetry - Event Batching', () => {
    let localStorageMock: {
        getItem: (key: string) => string | null;
        setItem: (key: string, value: string) => void;
        removeItem: (key: string) => void;
    };
    let mockStorage: Record<string, string>;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();

        mockStorage = {
            aId: 'test-uuid', // Pre-set the aId to avoid random_uid_created event
        };
        localStorageMock = {
            // nosemgrep: gitlab.eslint.detect-object-injection
            getItem: vi.fn((key: string) => mockStorage[key] ?? null),
            setItem: vi.fn((key: string, value: string) => {
                // nosemgrep: gitlab.eslint.detect-object-injection
                mockStorage[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                // nosemgrep: gitlab.eslint.detect-object-injection
                delete mockStorage[key];
            }),
        };
        vi.stubGlobal('localStorage', localStorageMock);

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: '',
            documentElement: {
                scrollHeight: 2000,
            },
            referrer: '',
        });

        mockFetch = vi.fn(() => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(new Response());
                }, FETCH_DELAY);
            });
        });
        vi.stubGlobal('fetch', mockFetch);

        vi.stubGlobal('window', {
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            location: {
                pathname: '/',
                href: 'http://localhost/',
                search: '',
                hash: '',
            },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });

        vi.stubGlobal('navigator', {
            language: 'en',
            userAgent: 'test-agent',
        });

        vi.stubGlobal('crypto', {
            randomUUID: () => 'test-uuid',
        });

        vi.stubGlobal('process', {
            env: {
                CI_COMMIT_TAG: 'v1.0.0+test',
            },
        });

        vi.stubGlobal('performance', {
            now: () => 0,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('batches multiple events and sends them together', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            events: {
                pageView: false, // Disable automatic page view events
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });

        // Send multiple events in quick succession
        telemetry.sendCustomEvent('custom_event_1', { test: true }, {});
        telemetry.sendCustomEvent('custom_event_2', { test: true }, {});

        // Events should be queued, not sent immediately
        expect(mockFetch).not.toHaveBeenCalled();

        // Advance timers
        await vi.advanceTimersByTimeAsync(200);

        // Should have made one fetch call with both events
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.lastCall![0] as URL;
        const init = mockFetch.mock.lastCall![1];
        expect(url).toBe('https://telemetry.test.com');
        const body = JSON.parse(init.body as string);

        expect(body.events).toHaveLength(2);
        expect(body.events[0].eventType).toBe('custom_event_1');
        expect(body.events[1].eventType).toBe('custom_event_2');
    });

    it('flushes remaining events on destroy', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            events: {
                pageView: false, // Disable automatic page view events
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });

        telemetry.sendCustomEvent('custom_event', { test: true }, {});

        // Events should be queued, not sent immediately
        expect(mockFetch).not.toHaveBeenCalled();

        telemetry.destroy();
        await vi.advanceTimersByTimeAsync(FETCH_DELAY);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.lastCall![0] as URL;
        const init = mockFetch.mock.lastCall![1];
        const result = mockFetch.mock.settledResults[0].value;

        expect(result.status).toBe(200);
        expect(url).toBe('https://telemetry.test.com');
        const body = JSON.parse(init.body as string);

        expect(body.events).toHaveLength(1);
        expect(body.events[0].eventType).toBe('custom_event');
    });

    it('handles multiple successive events if second event is triggered after the fetch delay', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            events: {
                pageView: false, // Disable automatic page view events
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });

        // Send multiple events in quick succession
        telemetry.sendCustomEvent('custom_event_1', { test: true }, {});

        // Events should be queued, not sent immediately
        expect(mockFetch).not.toHaveBeenCalled();

        // Advance timers
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        // Should have made one fetch call with both events
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const body1 = JSON.parse(mockFetch.mock.lastCall![1].body as string);

        expect(body1.events).toHaveLength(1);
        expect(body1.events[0].eventType).toBe('custom_event_1');

        await vi.advanceTimersByTimeAsync(FETCH_DELAY);

        telemetry.sendCustomEvent('custom_event_2', { test: true }, {});

        // Advance timers
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        const body2 = JSON.parse(mockFetch.mock.lastCall![1].body as string);
        expect(body2.events[0].eventType).toBe('custom_event_2');
    });

    it('handles multiple successive events if second event is triggered before the fetch delay', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            events: {
                pageView: false, // Disable automatic page view events
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });

        // Send multiple events in quick succession
        telemetry.sendCustomEvent('custom_event_1', { test: true }, {});

        // Events should be queued, not sent immediately
        expect(mockFetch).not.toHaveBeenCalled();

        // Advance timers
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        // Should have made one fetch call with both events
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const body1 = JSON.parse(mockFetch.mock.lastCall![1].body as string);

        expect(body1.events).toHaveLength(1);
        expect(body1.events[0].eventType).toBe('custom_event_1');

        /**
         * TODO: this demonstrates the race condition.
         * The second event is not sent because the event queue is cleared when the first fetch succeeds. This clearing includes the second event
         */
        await vi.advanceTimersByTimeAsync(FETCH_DELAY - 1);

        telemetry.sendCustomEvent('custom_event_2', { test: true }, {});

        // Advance timers
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        const body2 = JSON.parse(mockFetch.mock.lastCall![1].body as string);
        expect(body2.events[0].eventType).toBe('custom_event_2');
    });
});
