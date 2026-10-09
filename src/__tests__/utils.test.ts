import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getABTestFeatures, getFormattedUTCTimezone } from '../utils/index.ts';

describe('getFormattedUTCTimezone', () => {
    let originalDate: DateConstructor;

    beforeEach(() => {
        originalDate = global.Date;
    });

    afterEach(() => {
        global.Date = originalDate;
    });

    it('formats positive timezone offset correctly', () => {
        global.Date = class extends Date {
            getTimezoneOffset() {
                return -60;
            }
        } as DateConstructor;

        expect(getFormattedUTCTimezone()).toBe('UTC+01:00');
    });

    it('formats negative timezone offset correctly', () => {
        global.Date = class extends Date {
            getTimezoneOffset() {
                return 300;
            }
        } as DateConstructor;

        expect(getFormattedUTCTimezone()).toBe('UTC-05:00');
    });

    it('handles zero offset correctly', () => {
        global.Date = class extends Date {
            getTimezoneOffset() {
                return 0;
            }
        } as DateConstructor;

        expect(getFormattedUTCTimezone()).toBe('UTC+00:00');
    });

    it('handles odd timezones correctly', () => {
        global.Date = class extends Date {
            getTimezoneOffset() {
                return -330;
            }
        } as DateConstructor;

        expect(getFormattedUTCTimezone()).toBe('UTC+05:30');
    });
});

describe('getABTestFeatures', () => {
    function addTest(testName: string, variant: string) {
        const meta = document.createElement('meta');
        meta.name = `ab-test:${testName}`;
        meta.content = variant;
        document.head.append(meta);
    }

    afterEach(() => {
        document
            .querySelectorAll('meta[name^="ab-test:"]')
            .forEach((element) => element.remove());
        document.cookie = 'Features=; Max-Age=0; Path=/';
    });

    it('reports a variant that matches the Features cookie', () => {
        addTest('pricing', 'B');
        document.cookie = 'Features=pricing:B; Path=/';

        expect(getABTestFeatures()).toEqual({ pricing: 'B' });
    });

    it('reports nothing without a Features cookie', () => {
        addTest('pricing', 'A');

        expect(getABTestFeatures()).toEqual({});
    });

    it('drops a variant that differs from the Features cookie', () => {
        addTest('pricing', 'A');
        document.cookie = 'Features=pricing:B; Path=/';

        expect(getABTestFeatures()).toEqual({});
    });

    // The cookie value mirrors the growth middleware's serializeFeaturesCookie output
    it('checks each test on the page separately', () => {
        addTest('pricing', 'B');
        addTest('hero', 'A');
        addTest('footer', 'A');
        document.cookie = 'Features=hero:A,pricing:B,footer:B; Path=/';

        expect(getABTestFeatures()).toEqual({ pricing: 'B', hero: 'A' });
    });
});
