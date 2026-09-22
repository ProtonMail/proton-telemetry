import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PENDING_EVENTS_KEY,
    PENDING_EVENTS_MAX_COUNT,
    PENDING_EVENTS_VERSION,
    PENDING_EVENT_TTL_MS,
} from '../constants.ts';
import { createPendingEventsStore } from '../pendingEvents.ts';
import type { TelemetryEvent } from '../types/events.ts';
import { createSessionStorageMock } from './helpers/mocks.ts';

const event = (zId: string, messageId: string): TelemetryEvent => ({
    zId,
    messageId,
    clientEventTimestampUtc: '2026-01-01T00:00:00.000Z',
    clientEventTimestampLocal: '2026-01-01T01:00:00.000+01:00',
    eventType: 'custom_event',
    context: {
        campaign: {
            name: 'campaign',
            source: 'source',
            medium: 'medium',
            term: 'term',
            content: 'content',
        },
        library: { name: 'library', version: '1.0.0' },
        browserLocale: 'en-US',
        page: {
            title: 'title',
            url: 'https://example.test/path?query=value',
            path: '/path',
            referrer: 'https://referrer.test',
            queryString: '?query=value',
            queryParams: { query: 'value' },
        },
        referrer: {
            type: 'external',
            name: 'referrer',
            url: 'https://referrer.test',
        },
        screen: { width: 1920, height: 1080, density: 1 },
        timezone: 'Europe/Zurich',
        userAgent: 'test-agent',
        features: { experiment: 'variant' },
    },
    properties: {
        payload: `${zId}:${messageId}`,
        values: [true, 1, { nested: 'value' }],
        nested: { enabled: false, count: 1 },
    },
});

const stored = (event: TelemetryEvent, storedAt: number) => ({
    event,
    storedAt,
});
const container = (
    entries: unknown[],
    version: number = PENDING_EVENTS_VERSION,
) => JSON.stringify({ version, entries });

describe('pending events store', () => {
    let storage: ReturnType<typeof createSessionStorageMock>;

    const storedContainer = () =>
        JSON.parse(storage.getItem(PENDING_EVENTS_KEY)!);

    beforeEach(() => {
        storage = createSessionStorageMock();
        vi.stubGlobal('sessionStorage', storage);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('persists complete events with their timestamp and reads them in order', () => {
        vi.spyOn(Date, 'now').mockReturnValue(123);
        const store = createPendingEventsStore();
        const first = event('z-1', 'm-1');
        const second = event('z-2', 'm-2');
        store.persist(first);
        store.persist(second);
        expect(storedContainer()).toEqual({
            version: PENDING_EVENTS_VERSION,
            entries: [stored(first, 123), stored(second, 123)],
        });
        expect(store.read()).toEqual([first, second]);
    });

    it('removes exact requested identities and clears all entries', () => {
        const store = createPendingEventsStore();
        const first = event('z-1', 'm-1');
        const second = event('z-1', 'm-2');
        store.persist(first);
        store.persist(second);
        store.remove([first]);
        expect(store.read()).toEqual([second]);
        store.clear();
        expect(store.read()).toEqual([]);
    });

    it.each([
        ['malformed JSON', '{'],
        ['a bare array', '[]'],
        ['an unversioned container', '{"entries":[]}'],
        ['a stale version', container([], PENDING_EVENTS_VERSION + 1)],
        ['non-array entries', container([]).replace('[]', '{}')],
    ])('discards %s', (_, value) => {
        const store = createPendingEventsStore();
        store.persist(event('z-1', 'm-1'));
        storage._setStore({ [PENDING_EVENTS_KEY]: value });
        expect(store.read()).toEqual([]);
        expect(storage.removeItem).toHaveBeenCalledWith(PENDING_EVENTS_KEY);
    });

    it('never throws and recovers nothing when storage is unavailable', () => {
        const unavailable = () => {
            throw new Error('unavailable');
        };
        vi.stubGlobal('sessionStorage', {
            getItem: unavailable,
            setItem: unavailable,
            removeItem: unavailable,
        });
        const store = createPendingEventsStore();
        const saved = event('z-1', 'm-1');

        expect(() => {
            store.persist(saved);
            store.remove([saved]);
            store.clear();
        }).not.toThrow();
        expect(store.read()).toEqual([]);
    });

    it('never throws after a serialization failure', () => {
        const store = createPendingEventsStore();
        const unserializable = {
            ...event('z-1', 'm-1'),
            payload: BigInt(1),
        } as TelemetryEvent;

        expect(() => {
            store.persist(unserializable);
            store.read();
            store.remove([unserializable]);
            store.clear();
        }).not.toThrow();
    });

    it('removes invalid and out-of-date entries from storage', () => {
        vi.spyOn(Date, 'now').mockReturnValue(10_000);
        const valid = event('valid', 'valid');
        const hourOld = event('hour-old', 'event');
        const current = event('current', 'event');
        storage._setStore({
            [PENDING_EVENTS_KEY]: container([
                stored(valid, 9_999),
                stored(hourOld, 10_000 - PENDING_EVENT_TTL_MS),
                stored(current, 10_000),
                stored(
                    event('expired', 'event'),
                    10_000 - PENDING_EVENT_TTL_MS - 1,
                ),
                stored(event('future', 'event'), 10_001),
                stored({} as TelemetryEvent, 9_999),
                'not-an-entry',
            ]),
        });

        expect(createPendingEventsStore().read()).toEqual([
            valid,
            hourOld,
            current,
        ]);
        expect(storedContainer().entries).toEqual([
            stored(valid, 9_999),
            stored(hourOld, 10_000 - PENDING_EVENT_TTL_MS),
            stored(current, 10_000),
        ]);
    });

    it.each([
        ['blank identity', { zId: ' ' }],
        ['blank message identity', { messageId: '' }],
        ['blank event type', { eventType: '\n' }],
        ['array context', { context: [] }],
        ['missing properties', { properties: undefined }],
    ])('removes a stored event with %s', (_, invalid) => {
        vi.spyOn(Date, 'now').mockReturnValue(123);
        const valid = event('valid', 'valid');
        const invalidEvent = { ...event('invalid', 'invalid'), ...invalid };
        storage._setStore({
            [PENDING_EVENTS_KEY]: container([
                stored(valid, 123),
                stored(invalidEvent, 123),
            ]),
        });

        expect(createPendingEventsStore().read()).toEqual([valid]);
        expect(storedContainer().entries).toEqual([stored(valid, 123)]);
    });

    it('discards parsed overflow timestamps and normalizes storage', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1);
        const valid = event('valid', 'valid');
        storage._setStore({
            [PENDING_EVENTS_KEY]: container([stored(valid, 1)]).replace(
                ']}',
                ',{"event":{"zId":"overflow","messageId":"event"},"storedAt":1e400}]}',
            ),
        });

        expect(createPendingEventsStore().read()).toEqual([valid]);
        expect(storedContainer().entries).toEqual([stored(valid, 1)]);
    });

    it('keeps only the newest entries once the cap is exceeded', () => {
        vi.spyOn(Date, 'now').mockReturnValue(PENDING_EVENTS_MAX_COUNT + 1);
        const entries = Array.from(
            { length: PENDING_EVENTS_MAX_COUNT + 1 },
            (_, index) => stored(event(`z-${index}`, `m-${index}`), index + 1),
        );
        storage._setStore({ [PENDING_EVENTS_KEY]: container(entries) });

        expect(createPendingEventsStore().read()).toEqual(
            entries.slice(1).map(({ event }) => event),
        );
        expect(storedContainer().entries).toEqual(entries.slice(1));
    });

    it('persists and restores nothing when disabled, but still clears', () => {
        createPendingEventsStore().persist(event('z-1', 'm-1'));
        const disabled = createPendingEventsStore(false, false);

        disabled.persist(event('z-2', 'm-2'));
        expect(disabled.read()).toEqual([]);
        expect(createPendingEventsStore().read()).toHaveLength(1);

        disabled.clear();
        expect(storage.getItem(PENDING_EVENTS_KEY)).toBeNull();
    });

    it('removes the queue key after removing its final entry', () => {
        const store = createPendingEventsStore();
        const saved = event('z-1', 'm-1');
        store.persist(saved);
        store.remove([saved]);
        expect(storage.getItem(PENDING_EVENTS_KEY)).toBeNull();
    });
});
