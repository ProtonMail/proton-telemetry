import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../telemetry.ts';
import { BATCH_DELAY } from '../constants.ts';
import type { TelemetryEvent } from '../types/index.ts';

const getSentEvents = (): TelemetryEvent[] =>
    vi
        .mocked(fetch)
        .mock.calls.flatMap(
            ([, init]) => JSON.parse(init!.body as string).events,
        );

describe('ProtonTelemetry - Custom events', () => {
    beforeEach(() => {
        vi.useFakeTimers();

        const feature = document.createElement('meta');
        feature.name = 'ab-test:pricing';
        feature.content = 'variant-a';
        document.head.append(feature);
        document.cookie = 'Features=pricing:variant-a; Path=/';
    });

    afterEach(() => {
        document
            .querySelectorAll('meta[name^="ab-test:"]')
            .forEach((element) => element.remove());
        document.cookie = 'Features=; Max-Age=0; Path=/';
        vi.useRealTimers();
    });

    it('attaches current A/B-test features', async () => {
        const telemetry = createTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
            events: { pageView: false, click: false },
        });

        telemetry.sendCustomEvent('ui_select', { itemId: '12' });
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);

        const event = getSentEvents().find(
            ({ eventType }) => eventType === 'ui_select',
        );
        expect(event?.context.features).toEqual({ pricing: 'variant-a' });
        expect(event?.properties.data).toEqual({
            features: { pricing: 'variant-a' },
            itemId: '12',
        });
    });
});
