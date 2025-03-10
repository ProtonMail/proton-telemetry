import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFormattedUTCTimezone } from '../utils';

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
