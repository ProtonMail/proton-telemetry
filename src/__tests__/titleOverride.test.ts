import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import { destroyTelemetryInstance } from '../singleton';
import { getPageTitleOverride } from '../utils/storage';
import { BATCH_DELAY } from '../constants';
import {
    createSessionStorageMock,
    createLocalStorageMock,
    createFetchMock,
} from './helpers/mocks';

describe('Page title override', () => {
    let sessionStorageMock: ReturnType<typeof createSessionStorageMock>;
    let localStorageMock: ReturnType<typeof createLocalStorageMock>;
    let mockFetch: ReturnType<typeof createFetchMock>;

    beforeEach(() => {
        vi.useFakeTimers();

        sessionStorageMock = createSessionStorageMock();
        vi.stubGlobal('sessionStorage', sessionStorageMock);

        localStorageMock = createLocalStorageMock();
        vi.stubGlobal('localStorage', localStorageMock);

        mockFetch = createFetchMock();

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: 'Sensitive Chat Topic - User Secret',
            documentElement: {
                scrollHeight: 2000,
            },
        });

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            location: {
                pathname: '/',
                href: 'http://localhost/',
                search: '',
                hash: '',
            },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            innerWidth: 1920,
            innerHeight: 1080,
            scrollY: 0,
            navigator: {
                doNotTrack: null,
                globalPrivacyControl: false,
                language: 'en-US',
                userAgent: 'test-agent',
            },
        });

        vi.stubGlobal('performance', {
            now: vi.fn(() => Date.now()),
        });

        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers(),
        } as Response);
    });

    afterEach(() => {
        vi.useRealTimers();
        destroyTelemetryInstance();
        vi.restoreAllMocks();
    });

    it('should use actual page title when no override is set', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.events[0].context.page.title).toBe(
            'Sensitive Chat Topic - User Secret',
        );
    });

    it('should override page title when set in config', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            pageTitle: 'Redacted page title',
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.events[0].context.page.title).toBe('Redacted page title');
    });

    it('should use empty string when pageTitle is set to empty string', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            pageTitle: '',
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.events[0].context.page.title).toBe('');
    });

    it('should store page title override in sessionStorage', () => {
        ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            pageTitle: 'Redacted page title',
        });

        expect(getPageTitleOverride()).toBe('Redacted page title');
        const storedConfig = sessionStorageMock.getItem('__pt_config__');
        expect(storedConfig).toContain('"pageTitle":"Redacted page title"');
    });

    it('should use override value when sessionStorage is not available (in-memory fallback)', async () => {
        // Mock sessionStorage to throw an error (simulating unavailability)
        vi.stubGlobal('sessionStorage', {
            setItem: vi.fn(() => {
                throw new Error('sessionStorage not available');
            }),
            getItem: vi.fn(() => {
                throw new Error('sessionStorage not available');
            }),
            removeItem: vi.fn(() => {
                throw new Error('sessionStorage not available');
            }),
        });

        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            pageTitle: 'Override Title',
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        // Should use the override value even when sessionStorage is not available
        expect(body.events[0].context.page.title).toBe('Override Title');
    });
});
