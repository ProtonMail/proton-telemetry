import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import { destroyTelemetryInstance } from '../singleton';
import { BATCH_DELAY } from '../constants';
import type {
    TelemetryEvent,
    PageViewEventData,
    ClickEventData,
} from '../types';
import {
    createSessionStorageMock,
    createLocalStorageMock,
    createFetchMock,
} from './helpers/mocks';

describe('URL sanitization', () => {
    let localStorageMock: ReturnType<typeof createLocalStorageMock>;
    let mockFetch: ReturnType<typeof createFetchMock>;

    beforeEach(() => {
        vi.useFakeTimers();

        vi.stubGlobal('sessionStorage', createSessionStorageMock());

        localStorageMock = createLocalStorageMock();
        vi.stubGlobal('localStorage', localStorageMock);

        mockFetch = createFetchMock();

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: 'Test Page',
            referrer: 'https://app.example.com/prev-page#ref-hash',
            documentElement: { scrollHeight: 2000 },
        });

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            location: {
                pathname: '/room/abc-123',
                href: 'https://app.example.com/room/abc-123?utm_source=email#secret-token',
                search: '?utm_source=email',
                hash: '#secret-token',
            },
            screen: { width: 1920, height: 1080 },
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

        vi.stubGlobal('performance', { now: vi.fn(() => Date.now()) });

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

    function getAllEvents(): TelemetryEvent[] {
        const allEvents: TelemetryEvent[] = [];
        for (const call of mockFetch.mock.calls) {
            const body = JSON.parse(call[1].body as string) as {
                events: TelemetryEvent[];
            };
            allEvents.push(...body.events);
        }
        return allEvents;
    }

    function getFirstEvent(): TelemetryEvent {
        return getAllEvents()[0];
    }

    function findEventByType(eventType: string): TelemetryEvent | undefined {
        return getAllEvents().find((e) => e.eventType === eventType);
    }

    it('should strip hash by default when no urlSanitization is set', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const event = getFirstEvent();

        expect(event.context.page.url).toBe(
            'https://app.example.com/room/abc-123?utm_source=email',
        );
        expect(event.context.page.path).toBe('/room/abc-123');
        expect(event.context.page.referrer).toBe(
            'https://app.example.com/prev-page',
        );
    });

    it('should preserve hash when stripHash is set to false', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            urlSanitization: { stripHash: false },
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const event = getFirstEvent();

        expect(event.context.page.url).toBe(
            'https://app.example.com/room/abc-123?utm_source=email#secret-token',
        );
        expect(event.context.page.referrer).toBe(
            'https://app.example.com/prev-page#ref-hash',
        );
    });

    it('should strip hash from all URL fields and preserve path/query', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            urlSanitization: { stripHash: true },
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const event = getFirstEvent();

        expect(event.context.page.url).toBe(
            'https://app.example.com/room/abc-123?utm_source=email',
        );
        expect(event.context.page.path).toBe('/room/abc-123');
        expect(event.context.page.queryString).toBe('?utm_source=email');
        expect(event.context.page.queryParams).toEqual({
            utm_source: 'email',
        });
        expect(event.context.page.referrer).toBe(
            'https://app.example.com/prev-page',
        );
        expect(event.context.referrer.url).toBe(
            'https://app.example.com/prev-page',
        );

        const pageView = findEventByType('page_view');
        expect(pageView).toBeDefined();
        const props = pageView!.properties as PageViewEventData;
        expect(props.path).toBe('/room/abc-123');
        expect(props.referrer).toBe('https://app.example.com/prev-page');
    });

    it('should apply sanitizeUrl callback and recalculate path/search', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            urlSanitization: {
                stripHash: false,
                sanitizeUrl: (url) => {
                    url.pathname = url.pathname.replace(
                        /\/room\/[^/?#]+/,
                        '/room/[redacted]',
                    );
                    return url;
                },
            },
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        const event = getFirstEvent();

        expect(event.context.page.url).toBe(
            'https://app.example.com/room/[redacted]?utm_source=email#secret-token',
        );
        expect(event.context.page.path).toBe('/room/[redacted]');
    });

    it('should apply stripHash before sanitizeUrl', async () => {
        const receivedUrls: string[] = [];
        const sanitizeUrlSpy = (url: URL) => {
            receivedUrls.push(url.href);
            return url;
        };

        ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            urlSanitization: {
                stripHash: true,
                sanitizeUrl: sanitizeUrlSpy,
            },
        });

        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(receivedUrls.length).toBeGreaterThan(0);
        // The page URL should have its hash already stripped before reaching the callback
        expect(receivedUrls).toContain(
            'https://app.example.com/room/abc-123?utm_source=email',
        );
    });

    it('should fall back to pre-callback URL when sanitizeUrl throws', async () => {
        const telemetry = ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            urlSanitization: {
                stripHash: true,
                sanitizeUrl: () => {
                    throw new Error('callback error');
                },
            },
        });

        telemetry.sendPageView();
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        const event = getFirstEvent();

        expect(event.context.page.url).toBe(
            'https://app.example.com/room/abc-123?utm_source=email',
        );
    });

    it('should sanitize elementHref in click events', async () => {
        const docAddEventListener = vi.fn();
        vi.stubGlobal('document', {
            addEventListener: docAddEventListener,
            removeEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: 'Test Page',
            referrer: '',
            documentElement: { scrollHeight: 2000 },
        });

        ProtonTelemetry({
            endpoint: 'https://example.com/telemetry',
            appVersion: 'test@1.0.0',
            urlSanitization: { stripHash: true },
            events: { click: true, pageView: false },
        });

        const clickCall = docAddEventListener.mock.calls.find(
            (call: unknown[]) => call[0] === 'click',
        );
        expect(clickCall).toBeDefined();
        const clickHandler = clickCall![1] as EventListener;

        clickHandler({
            target: {
                tagName: 'A',
                id: 'test-link',
                href: 'https://app.example.com/room/other#sensitive-hash',
            },
            pageX: 100,
            pageY: 200,
        } as unknown as Event);

        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        expect(mockFetch).toHaveBeenCalled();
        const event = findEventByType('click');
        expect(event).toBeDefined();

        const props = event!.properties as ClickEventData;
        expect(props.elementHref).toBe('https://app.example.com/room/other');
    });
});
