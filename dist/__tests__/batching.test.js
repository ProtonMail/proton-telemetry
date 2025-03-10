import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createAnalytics as ProtonAnalytics } from '../analytics';
describe('ProtonAnalytics - Event Batching', () => {
    let localStorageMock;
    let mockStorage;
    let mockFetch;
    beforeEach(() => {
        vi.useFakeTimers();
        mockStorage = {
            aId: 'test-uuid', // Pre-set the anonymous ID to avoid random_uid_created event
        };
        localStorageMock = {
            getItem: vi.fn((key) => mockStorage[key] ?? null),
            setItem: vi.fn((key, value) => {
                mockStorage[key] = value;
            }),
            removeItem: vi.fn((key) => {
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
        mockFetch = vi.fn().mockResolvedValue(new Response());
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
        const analytics = ProtonAnalytics({
            endpoint: 'https://analytics.test.com',
            siteId: 'test-site',
            events: {
                pageView: false, // Disable automatic page view tracking
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });
        // Track multiple events in quick succession
        analytics.trackCustomEvent('custom_event_1', { test: true }, {});
        analytics.trackCustomEvent('custom_event_2', { test: true }, {});
        // Events should be queued, not sent immediately
        expect(mockFetch).not.toHaveBeenCalled();
        // Advance timers
        await vi.advanceTimersByTimeAsync(200);
        // Should have made one fetch call with both events
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.lastCall;
        expect(url).toBe('https://analytics.test.com');
        const body = JSON.parse(init.body);
        expect(body.events).toHaveLength(2);
        expect(body.events[0].eventType).toBe('custom_event_1');
        expect(body.events[1].eventType).toBe('custom_event_2');
    });
    it('flushes remaining events on destroy', async () => {
        const analytics = ProtonAnalytics({
            endpoint: 'https://analytics.test.com',
            siteId: 'test-site',
            events: {
                pageView: false, // Disable automatic page view tracking
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });
        analytics.trackCustomEvent('custom_event', { test: true }, {});
        // Events should be queued, not sent immediately
        expect(mockFetch).not.toHaveBeenCalled();
        await analytics.destroy();
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.lastCall;
        expect(url).toBe('https://analytics.test.com');
        const body = JSON.parse(init.body);
        expect(body.events).toHaveLength(1);
        expect(body.events[0].eventType).toBe('custom_event');
    });
});
