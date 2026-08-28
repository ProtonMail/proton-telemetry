import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../telemetry.ts';
import { createLocalStorageMock } from './helpers/mocks.ts';

describe('ProtonTelemetry - Page lifecycle', () => {
    const telemetryInstances: Array<ReturnType<typeof createTelemetry>> = [];
    let mockFetch: ReturnType<typeof vi.fn>;

    const setVisibility = (
        visibilityState: DocumentVisibilityState,
        hidden: boolean,
    ) => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: visibilityState,
        });
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: hidden,
        });
    };

    const initTelemetry = (
        events: Parameters<typeof createTelemetry>[0]['events'] = {},
    ) => {
        const telemetry = createTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            telemetryEnabled: true,
            events,
        });
        telemetryInstances.push(telemetry);
        return telemetry;
    };

    beforeEach(() => {
        vi.stubGlobal(
            'localStorage',
            createLocalStorageMock({ zId: 'test-uuid' }),
        );
        setVisibility('visible', false);
        mockFetch = vi.fn().mockResolvedValue(new Response());
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(async () => {
        await Promise.resolve();
        await Promise.all(
            telemetryInstances
                .splice(0)
                .map((telemetry) => telemetry.destroy()),
        );
    });

    it('flushes queued events when the document becomes hidden', () => {
        const telemetry = initTelemetry();
        telemetry.sendCustomEvent('queued_event');
        expect(mockFetch).not.toHaveBeenCalled();

        setVisibility('hidden', true);
        document.dispatchEvent(new Event('visibilitychange'));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const request = mockFetch.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(request.body as string);
        expect(request.keepalive).toBe(true);
        expect(body.events).toHaveLength(1);
        expect(body.events[0].eventType).toBe('queued_event');
    });

    it('does not flush queued events when the document becomes visible', () => {
        const telemetry = initTelemetry();
        telemetry.sendCustomEvent('queued_event');

        document.dispatchEvent(new Event('visibilitychange'));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('flushes each queued event once when pagehide is followed by beforeunload', () => {
        const telemetry = initTelemetry({ exit: true });
        telemetry.sendCustomEvent('queued_event');

        window.dispatchEvent(new Event('pagehide'));
        window.dispatchEvent(new Event('beforeunload'));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const request = mockFetch.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(request.body as string);
        expect(
            body.events.map(
                ({ eventType }: { eventType: string }) => eventType,
            ),
        ).toEqual(['queued_event', 'exit']);
    });

    it('flushes each event once when hidden is followed by pagehide', async () => {
        let resolveHiddenFlush!: (response: Response) => void;
        mockFetch.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveHiddenFlush = resolve;
                }),
        );
        const telemetry = initTelemetry({ exit: true });
        telemetry.sendCustomEvent('queued_event');

        setVisibility('hidden', true);
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));

        expect(mockFetch).toHaveBeenCalledTimes(2);
        const eventTypes = mockFetch.mock.calls.flatMap(([, request]) => {
            const body = JSON.parse((request as RequestInit).body as string);
            return body.events.map(
                ({ eventType }: { eventType: string }) => eventType,
            );
        });
        expect(eventTypes).toEqual(['queued_event', 'exit']);

        resolveHiddenFlush(new Response());
        await Promise.resolve();
    });

    it('does not register a beforeunload listener', () => {
        const addEventListener = vi.spyOn(window, 'addEventListener');

        initTelemetry({ exit: true });

        expect(addEventListener).not.toHaveBeenCalledWith(
            'beforeunload',
            expect.any(Function),
        );
    });
});
