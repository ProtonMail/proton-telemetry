import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../telemetry';
import {
    setTelemetryEnabled,
    getTelemetryInstance,
    destroyTelemetryInstance,
} from '../singleton';
import { getTelemetryEnabled } from '../utils/storage';
import { BATCH_DELAY } from '../constants';
import {
    createLocalStorageMock,
    createSessionStorageMock,
    createFetchMock,
    setupNavigatorMock,
    setupPerformanceMock,
} from './helpers/mocks';
import { createBasicTelemetryConfig } from './helpers/fixtures';

describe('Telemetry enabled controls', () => {
    let mockFetch: ReturnType<typeof createFetchMock>;
    let localStorageMock: ReturnType<typeof createLocalStorageMock>;
    let sessionStorageMock: ReturnType<typeof createSessionStorageMock>;

    // Standard config to disable all automatic events to prevent test contamination
    const getBaseConfig = () =>
        createBasicTelemetryConfig({
            endpoint: 'https://test.example.com',
            appVersion: 'test@1.0.0',
            events: {
                pageView: false,
                click: false,
                form: false,
                performance: false,
                visibility: false,
                modal: false,
            },
        });

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        await destroyTelemetryInstance();

        localStorageMock = createLocalStorageMock({ aId: 'test-uuid' });
        vi.stubGlobal('localStorage', localStorageMock);
        sessionStorageMock = createSessionStorageMock();
        vi.stubGlobal('sessionStorage', sessionStorageMock);
        mockFetch = createFetchMock();
        mockFetch.mockResolvedValue(new Response());
        setupNavigatorMock();
        setupPerformanceMock();

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

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            location: {
                pathname: '/test',
                search: '',
                hostname: 'test.example.com',
                protocol: 'https:',
            },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            innerWidth: 1920,
            innerHeight: 1080,
            scrollY: 0,
        });
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        await destroyTelemetryInstance();
    });

    describe('Initialization with telemetryEnabled', () => {
        it('uses actual events when telemetryEnabled is true', async () => {
            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: true,
            });

            expect(getTelemetryEnabled()).toBe(true);
            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://test.example.com',
                expect.objectContaining({
                    method: 'POST',
                }),
            );
        });

        it('does not send events when telemetryEnabled is false', async () => {
            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: false,
            });

            expect(getTelemetryEnabled()).toBe(false);
            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('defaults to true when telemetryEnabled is undefined', async () => {
            const telemetry = createTelemetry({
                ...getBaseConfig(),
            });

            expect(getTelemetryEnabled()).toBe(true);
            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);

            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('Runtime telemetry control', () => {
        it('allows enabling telemetry at runtime', async () => {
            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: false,
            });

            expect(getTelemetryEnabled()).toBe(false);
            telemetry.setTelemetryEnabled(true);
            expect(getTelemetryEnabled()).toBe(true);
            telemetry.sendCustomEvent('test_event');

            await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            expect(mockFetch).toHaveBeenCalled();
        });

        it('allows disabling telemetry at runtime', async () => {
            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: true,
            });

            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            mockFetch.mockClear();
            telemetry.setTelemetryEnabled(false);
            expect(getTelemetryEnabled()).toBe(false);

            telemetry.sendCustomEvent('test_event_after_disable');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Singleton API', () => {
        it('controls telemetry through singleton API', () => {
            getTelemetryInstance({
                ...getBaseConfig(),
                telemetryEnabled: true,
            });

            expect(getTelemetryEnabled()).toBe(true);
            setTelemetryEnabled(false);
            expect(getTelemetryEnabled()).toBe(false);
            setTelemetryEnabled(true);
            expect(getTelemetryEnabled()).toBe(true);
        });
    });

    describe('SessionStorage persistence', () => {
        it('persists telemetry enabled setting across page reloads', () => {
            // First initialization - disable telemetry
            createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: false,
            });

            expect(getTelemetryEnabled()).toBe(false);

            // Verify that the config was stored
            const sessionStore = sessionStorageMock._getStore();
            expect(sessionStore['__pt_config__']).toBeDefined();
            expect(sessionStore['__pt_config__']).toContain(
                '"telemetryEnabled":false',
            );

            expect(getTelemetryEnabled()).toBe(false);
        });
    });

    describe('Integration with DNT/GPC', () => {
        it('respects telemetry enabled setting even when DNT is not set', async () => {
            // Ensure DNT/GPC are not set
            vi.stubGlobal('navigator', {
                doNotTrack: '0',
                globalPrivacyControl: false,
                language: 'en-US',
            });

            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: false,
            });

            expect(getTelemetryEnabled()).toBe(false);
            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('does not send events when telemetry is enabled but DNT is set', async () => {
            vi.stubGlobal('navigator', {
                doNotTrack: '1',
                globalPrivacyControl: false,
                language: 'en-US',
            });

            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: true,
            });

            expect(getTelemetryEnabled()).toBe(true);
            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Identifier cleanup', () => {
        it('cleans up identifiers when disabling at runtime', async () => {
            localStorageMock._setStore({ aId: 'existing-id' });

            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: true,
            });

            telemetry.setTelemetryEnabled(false);
            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);
            expect(localStorageMock.removeItem).toHaveBeenCalledWith('aId');
        });
    });

    describe('Graceful fallback when sessionStorage unavailable', () => {
        it('works when sessionStorage is not available', async () => {
            vi.stubGlobal('sessionStorage', {
                getItem: vi.fn().mockImplementation(() => {
                    throw new Error('sessionStorage not available');
                }),
                setItem: vi.fn().mockImplementation(() => {
                    throw new Error('sessionStorage not available');
                }),
                removeItem: vi.fn(),
                clear: vi.fn(),
            });

            const telemetry = createTelemetry({
                ...getBaseConfig(),
                telemetryEnabled: false,
            });

            expect(getTelemetryEnabled()).toBe(false);

            telemetry.sendCustomEvent('test_event');
            await vi.advanceTimersByTimeAsync(BATCH_DELAY);

            expect(mockFetch).not.toHaveBeenCalled();
        });
    });
});
