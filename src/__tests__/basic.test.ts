import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import { BATCH_DELAY } from '../constants';

describe('ProtonTelemetry - Basic Functionality', () => {
    let telemetry: ReturnType<typeof ProtonTelemetry>;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();

        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        vi.stubGlobal('localStorage', localStorageMock);

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            location: { pathname: '/' },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            innerWidth: 1920,
            innerHeight: 1080,
            scrollY: 0,
        });

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: '',
            documentElement: {
                scrollHeight: 2000,
            },
        });

        mockFetch = vi.fn().mockResolvedValue(new Response());
        vi.stubGlobal('fetch', mockFetch);

        vi.stubGlobal('navigator', {
            doNotTrack: null,
            language: 'en',
        });

        telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
        });

        vi.spyOn(telemetry, 'sendPageView');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('initializes with correct config', () => {
        expect(telemetry).toBeDefined();
    });

    it('sends page view events', () => {
        telemetry.sendPageView();
        expect(telemetry.sendPageView).toHaveBeenCalled();
    });

    it('adds appVersion header', async () => {
        mockFetch.mockClear();

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const init = mockFetch.mock.lastCall![1];

        expect(init.headers['x-pm-appversion']).toBe('appVersion');
    });
});

describe('ProtonTelemetry - Headers', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        mockFetch = vi.fn().mockResolvedValue(new Response());

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
        });

        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('includes x-pm-uid header when uid is provided', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            uidHeader: 'test-id',
        });

        telemetry.sendCustomEvent('test_event', {});
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const init = mockFetch.mock.calls[0][1] as RequestInit;
        expect(init.headers).toHaveProperty('x-pm-uid', 'test-id');
    });

    it('does not include x-pm-uid header when uid is not provided', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
        });

        telemetry.sendCustomEvent('test_event', {});
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const init = mockFetch.mock.calls[0][1] as RequestInit;
        expect(init.headers).not.toHaveProperty('x-pm-uid');
    });
});
