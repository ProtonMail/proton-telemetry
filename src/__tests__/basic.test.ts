import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';

describe('ProtonTelemetry - Basic Functionality', () => {
    let telemetry: ReturnType<typeof ProtonTelemetry>;
    let mockFetch: any;

    beforeEach(() => {
        vi.useFakeTimers();

        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
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
        telemetry.sendPageView();

        // Advance timers
        await vi.advanceTimersByTimeAsync(200);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.lastCall;

        expect(init.headers['x-pm-appversion']).toBe('appVersion');
    });
});
