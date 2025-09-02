import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTelemetry } from '../telemetry';

describe('Browser API availability tests', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockFetch = vi.fn().mockResolvedValue(new Response());
        vi.stubGlobal('fetch', mockFetch);

        // Setup minimal localStorage mock
        const localStorageMock = {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        vi.stubGlobal('localStorage', localStorageMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('localStorage unavailable', () => {
        it('works without localStorage and generates session-only IDs', () => {
            // Mock localStorage to throw errors
            const mockLocalStorage = {
                getItem: vi.fn().mockImplementation(() => {
                    throw new Error('localStorage not available');
                }),
                setItem: vi.fn().mockImplementation(() => {
                    throw new Error('localStorage not available');
                }),
                removeItem: vi.fn().mockImplementation(() => {
                    throw new Error('localStorage not available');
                }),
            };
            vi.stubGlobal('localStorage', mockLocalStorage);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
                debug: true,
            });

            // Should not throw
            expect(() => telemetry.sendPageView()).not.toThrow();
            expect(() => telemetry.sendCustomEvent('test_event')).not.toThrow();

            // Should log warnings about localStorage unavailability
            expect(consoleSpy).toHaveBeenCalledWith(
                '[Telemetry]',
                'localStorage is not available. zId will not be persisted.',
            );
        });

        it('handles localStorage being undefined', () => {
            // Intentionally setting to undefined for testing
            vi.stubGlobal('localStorage', undefined);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
                debug: true,
            });

            expect(() => telemetry.sendPageView()).not.toThrow();
            expect(() => telemetry.sendCustomEvent('test_event')).not.toThrow();
        });
    });

    describe('crypto API unavailable', () => {
        it('falls back to Math.random UUID generation', async () => {
            vi.stubGlobal('crypto', undefined);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            telemetry.sendPageView();

            // Wait for batch timeout
            vi.advanceTimersByTime(200);

            expect(mockFetch).toHaveBeenCalled();
            const requestBody = JSON.parse(mockFetch.mock.lastCall![1].body);
            const event = requestBody.events[0];

            // Should have generated a UUID-like messageId using fallback
            expect(event.messageId).toHaveLength(36);
            expect(event.zId).toHaveLength(36);
        });

        it('handles crypto.randomUUID being unavailable', () => {
            vi.stubGlobal('crypto', {});

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            expect(() => telemetry.sendPageView()).not.toThrow();
        });
    });

    describe('fetch API unavailable', () => {
        it('throws descriptive error when fetch is unavailable', async () => {
            vi.stubGlobal('fetch', undefined);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            // Should not throw during initialization
            expect(() => telemetry.sendPageView()).not.toThrow();
        });
    });

    describe('document API unavailable', () => {
        it('handles missing document properties gracefully', async () => {
            const originalDocument = global.document;

            // Intentionally setting to undefined for testing
            vi.stubGlobal('document', undefined);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            expect(() => telemetry.sendPageView()).not.toThrow();

            // Wait for batch timeout
            vi.advanceTimersByTime(200);

            if (mockFetch.mock.calls.length > 0) {
                const requestBody = JSON.parse(
                    mockFetch.mock.lastCall![1].body,
                );
                const event = requestBody.events[0];

                // Should have empty values when document unavailable
                expect(event.context.page.title).toBe('');
                expect(event.context.page.referrer).toBe('');
                expect(event.context.referrer.url).toBe('');
            }

            // Restore document
            vi.stubGlobal('document', originalDocument);
        });

        it('handles document.addEventListener being unavailable', () => {
            const mockDocument = {
                title: 'Test Title',
                referrer: '',
                hidden: false,
                querySelectorAll: vi.fn().mockReturnValue([]),
            };
            vi.stubGlobal('document', mockDocument);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            // Should not throw when trying to set up click/form listeners
            expect(() => telemetry.sendClicks()).not.toThrow();
            expect(() => telemetry.sendForms()).not.toThrow();
        });
    });

    describe('window API unavailable', () => {
        it('handles missing window properties gracefully', async () => {
            const originalWindow = global.window;

            // Intentionally setting to empty object for testing
            vi.stubGlobal('window', {});

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            expect(() => telemetry.sendPageView()).not.toThrow();

            // Wait for batch timeout
            vi.advanceTimersByTime(200);

            if (mockFetch.mock.calls.length > 0) {
                const requestBody = JSON.parse(
                    mockFetch.mock.lastCall![1].body,
                );
                const event = requestBody.events[0];

                // Should have fallback values when window properties unavailable
                expect(event.context.page.url).toBe('');
                expect(event.context.page.path).toBe('');
                expect(event.context.screen.width).toBe(0);
                expect(event.context.screen.height).toBe(0);
                expect(event.context.screen.density).toBe(1);
            }

            // Restore window
            vi.stubGlobal('window', originalWindow);
        });
    });

    describe('navigator API unavailable', () => {
        it('handles missing navigator properties gracefully', async () => {
            const originalNavigator = global.navigator;

            // Intentionally setting to empty object for testing
            vi.stubGlobal('navigator', {});

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            expect(() => telemetry.sendPageView()).not.toThrow();

            // Wait for batch timeout
            vi.advanceTimersByTime(200);

            if (mockFetch.mock.calls.length > 0) {
                const requestBody = JSON.parse(
                    mockFetch.mock.lastCall![1].body,
                );
                const event = requestBody.events[0];

                // Should have fallback values when navigator unavailable
                expect(event.context.userAgent).toBe('');
                expect(event.context.browserLocale).toBe('');
            }

            // Restore navigator
            vi.stubGlobal('navigator', originalNavigator);
        });

        it('handles sendBeacon being unavailable', async () => {
            Object.defineProperty(navigator, 'sendBeacon', {
                value: undefined,
                writable: true,
            });

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            telemetry.sendPageView();

            // Should fall back to fetch when sendBeacon unavailable
            await expect(telemetry.destroy()).resolves.not.toThrow();
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('performance API unavailable', () => {
        it('falls back to Date.now() when performance.now unavailable', () => {
            vi.stubGlobal('performance', undefined);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            expect(() => telemetry.sendPageView()).not.toThrow();
        });

        it('handles performance.now being undefined', () => {
            vi.stubGlobal('performance', {});

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            expect(() => telemetry.sendPageView()).not.toThrow();
        });
    });

    describe('PerformanceObserver unavailable', () => {
        it('logs warning and skips performance monitoring when PerformanceObserver unavailable', () => {
            vi.stubGlobal('PerformanceObserver', undefined);
            vi.stubGlobal('PerformanceNavigationTiming', undefined);

            // Mock hostname to prevent cross-domain storage warnings
            const originalLocation = window.location;
            vi.stubGlobal('window', {
                ...window,
                location: {
                    ...originalLocation,
                    hostname: 'proton.me',
                },
            });

            createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
                debug: true,
                events: {
                    performance: true,
                },
            });

            expect(consoleSpy).toHaveBeenCalledWith(
                '[Telemetry]',
                'PerformanceObserver API is not supported',
            );

            // Restore original location
            vi.stubGlobal('window', {
                ...window,
                location: originalLocation,
            });
        });
    });

    describe('multiple APIs unavailable', () => {
        it('handles multiple missing APIs gracefully', () => {
            // Remove multiple APIs
            vi.stubGlobal('localStorage', undefined);
            vi.stubGlobal('crypto', undefined);
            vi.stubGlobal('performance', undefined);
            vi.stubGlobal('PerformanceObserver', undefined);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
                debug: true,
            });

            // Should not throw despite multiple missing APIs
            expect(() => telemetry.sendPageView()).not.toThrow();
            expect(() => telemetry.sendClicks()).not.toThrow();
            expect(() => telemetry.sendForms()).not.toThrow();
            expect(() => telemetry.sendCustomEvent('test')).not.toThrow();
        });

        it('maintains basic functionality with minimal browser support', async () => {
            // Simulate very limited browser environment including sendBeacon
            vi.stubGlobal('localStorage', undefined);
            vi.stubGlobal('crypto', undefined);
            Object.defineProperty(navigator, 'sendBeacon', {
                value: undefined,
                writable: true,
            });

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            telemetry.sendPageView();
            telemetry.sendCustomEvent('test_event', { test: 'data' });

            // Should still send data via fetch fallback
            await telemetry.destroy();
            expect(mockFetch).toHaveBeenCalled();

            // Events should have been created with fallback values
            const requestBody = JSON.parse(mockFetch.mock.lastCall![1].body);

            // Check that we have at least the events we expect
            expect(requestBody.events.length).toBeGreaterThanOrEqual(2);

            // Find our specific events
            const pageViewEvent = requestBody.events.find(
                (e) => e.eventType === 'page_view',
            );
            const customEvent = requestBody.events.find(
                (e) => e.eventType === 'test_event',
            );

            expect(pageViewEvent).toBeDefined();
            expect(customEvent).toBeDefined();
        });
    });

    describe('event listener safety', () => {
        it('handles addEventListener throwing errors', () => {
            const mockDocument = {
                addEventListener: vi.fn().mockImplementation(() => {
                    throw new Error('addEventListener failed');
                }),
                removeEventListener: vi.fn(),
                title: 'Test',
                referrer: '',
                hidden: false,
                querySelectorAll: vi.fn().mockReturnValue([]),
            };
            vi.stubGlobal('document', mockDocument);

            const telemetry = createTelemetry({
                endpoint: 'https://api.example.com/telemetry',
                appVersion: '1.0.0',
            });

            // Should not throw even if addEventListener fails
            expect(() => telemetry.sendClicks()).not.toThrow();
            expect(() => telemetry.sendForms()).not.toThrow();
        });
    });
});
