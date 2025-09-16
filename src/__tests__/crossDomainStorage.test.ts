import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createCrossDomainStorage,
    handleCrossDomainTelemetryId,
} from '../crossDomainStorage';
import {
    setupCrossDomainTest,
    cleanupMocks,
    createCookieMock,
    createLocalStorageMock,
    createWindowMock,
} from './helpers';

describe('CrossDomainStorage', () => {
    let storage: ReturnType<typeof createCrossDomainStorage>;
    let mockCookie: ReturnType<typeof createCookieMock>;
    let mockLocalStorage: ReturnType<typeof createLocalStorageMock>;
    let mockWindow: ReturnType<typeof createWindowMock>;

    beforeEach(() => {
        const mocks = setupCrossDomainTest('proton.me');
        mockCookie = mocks.mockCookie;
        mockLocalStorage = mocks.mockLocalStorage;
        mockWindow = mocks.mockWindow;

        storage = createCrossDomainStorage({}, true);
    });

    afterEach(() => {
        cleanupMocks();
    });

    describe('Domain detection', () => {
        it('detects proton.me domain', () => {
            setupCrossDomainTest('proton.me');
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.me',
            });
        });

        it('detects any proton.me subdomain', () => {
            setupCrossDomainTest('any.subdomain.proton.me');
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.me',
            });
        });

        it('detects protonvpn.com domain', () => {
            setupCrossDomainTest('protonvpn.com');
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'protonvpn.com',
            });
        });

        it('detects any protonvpn.com subdomain', () => {
            setupCrossDomainTest('any.subdomain.protonvpn.com');
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'protonvpn.com',
            });
        });

        it('detects proton.black scientist environment', () => {
            setupCrossDomainTest('scientist123.proton.black');
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.black',
            });
        });

        it('detects any proton.black subdomain', () => {
            setupCrossDomainTest('any.subdomain.scientist123.proton.black');
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.black',
            });
        });

        it('returns null for unsupported domains', () => {
            mockWindow.location.hostname = 'example.com';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toBeNull();
        });
    });

    describe('Telemetry ID management', () => {
        it('sets and gets telemetry ID', () => {
            const testId = 'test-telemetry-id-123';
            const success = storage.setTelemetryId(testId);

            expect(success).toBe(true);

            const retrieved = storage.getTelemetryId();
            expect(retrieved).toBe(testId);
        });

        it('returns null for non-existent telemetry ID', () => {
            const retrieved = storage.getTelemetryId();
            expect(retrieved).toBeNull();
        });

        it('handles expired telemetry ID', async () => {
            vi.useFakeTimers();
            const testId = 'test-telemetry-id-456';
            const shortStorage = createCrossDomainStorage(
                {
                    maxAge: 1,
                },
                true,
            );

            let success = shortStorage.setTelemetryId(testId);
            expect(success).toBe(true);

            let retrievedInitially = shortStorage.getTelemetryId();
            expect(retrievedInitially).toBe(testId);

            // Advance time by more than maxAge
            vi.advanceTimersByTime(1001);

            const retrievedAfterExpiry = shortStorage.getTelemetryId();
            expect(retrievedAfterExpiry).toBeNull();
            vi.useRealTimers();
        });

        it('falls back to legacy aId cookie and migrates to zId', () => {
            const legacyValue = btoa(
                JSON.stringify({
                    aId: 'legacy-id-999',
                    timestamp: Date.now(),
                    version: 1,
                }),
            );
            document.cookie = `aId=${legacyValue}; Max-Age=300; Domain=.proton.me; Path=/`;

            const retrieved = storage.getTelemetryId();
            expect(retrieved).toBe('legacy-id-999');

            const zCookie = document.cookie.includes('zId=');
            expect(zCookie).toBe(true);
        });
    });

    describe('LocalStorage transfer', () => {
        it('transfers telemetry ID to localStorage', () => {
            const testId = 'test-telemetry-id-123';
            storage.setTelemetryId(testId);

            const success = storage.transferToLocalStorage();

            expect(success).toBe(true);
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                'zId',
                testId,
            );
        });

        it('transfers with custom storage key', () => {
            const testId = 'test-telemetry-id-123';
            const customKey = 'customTelemetryId';
            storage.setTelemetryId(testId);

            const success = storage.transferToLocalStorage(customKey);

            expect(success).toBe(true);
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                customKey,
                testId,
            );
        });

        it('returns false when no telemetry ID exists', () => {
            const success = storage.transferToLocalStorage();
            expect(success).toBe(false);
        });

        it("mirrors zId into legacy 'aId' key during migration", () => {
            const testId = 'test-telemetry-id-789';
            storage.setTelemetryId(testId);

            const success = storage.transferToLocalStorage();

            expect(success).toBe(true);
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                'zId',
                testId,
            );
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                'aId',
                testId,
            );
        });
    });

    describe('Cookie cleanup', () => {
        it('cleans up cookie', () => {
            const testId = 'test-telemetry-id-123';
            storage.setTelemetryId(testId);

            // Verify cookie exists before cleanup
            expect(storage.getTelemetryId()).toBe(testId);

            storage.cleanupCookie();

            // Check that the cleanup cookie string contains expiration directives
            expect(mockCookie.lastSetCookie).toContain('Max-Age=0');
            expect(mockCookie.lastSetCookie).toContain(
                'expires=Thu, 01 Jan 1970 00:00:00 GMT',
            );

            // Verify cookie is actually removed
            expect(storage.getTelemetryId()).toBeNull();
        });

        it('removes both zId and legacy aId cookies on cleanup', () => {
            const testId = 'test-cookie-cleanup-124';
            storage.setTelemetryId(testId);

            // Ensure both cookies were written
            expect(document.cookie.includes('zId=')).toBe(true);
            expect(document.cookie.includes('aId=')).toBe(true);

            storage.cleanupCookie();

            expect(document.cookie.includes('zId=')).toBe(false);
            expect(document.cookie.includes('aId=')).toBe(false);
        });
    });

    describe('Support detection', () => {
        it('detects support when on supported domain', () => {
            mockWindow.location.hostname = 'proton.me';
            const storage = createCrossDomainStorage();

            expect(storage.isSupported()).toBe(true);
        });

        it('does not support when on unsupported domain', () => {
            mockWindow.location.hostname = 'example.com';
            const storage = createCrossDomainStorage();

            expect(storage.isSupported()).toBe(false);
        });
    });

    describe('Error handling', () => {
        it('does not crash when document is unavailable', () => {
            const originalDocument = global.document;
            // @ts-expect-error - Intentionally deleting global.document for testing
            delete global.document;

            const storage = createCrossDomainStorage();
            expect(() => {
                storage.setTelemetryId('test');
                storage.getTelemetryId();
                storage.transferToLocalStorage();
                storage.cleanupCookie();
            }).not.toThrow();

            global.document = originalDocument;
        });

        it('does not crash when localStorage is unavailable', () => {
            const originalLocalStorage = global.localStorage;
            // @ts-expect-error - Intentionally deleting global.localStorage for testing
            delete global.localStorage;

            const storage = createCrossDomainStorage();
            expect(() => {
                storage.transferToLocalStorage();
            }).not.toThrow();

            global.localStorage = originalLocalStorage;
        });
    });
});

describe('handleCrossDomainTelemetryId', () => {
    let mockLocalStorage: ReturnType<typeof createLocalStorageMock>;

    beforeEach(() => {
        const mocks = setupCrossDomainTest('proton.me');
        mockLocalStorage = mocks.mockLocalStorage;
    });

    it('returns current zId when provided', () => {
        const currentId = 'current-id-123';
        const result = handleCrossDomainTelemetryId(currentId);

        expect(result).toBe(currentId);
    });

    it('retrieves zId from cross-domain cookie when no current zId', () => {
        // Set up a cookie first
        const storage = createCrossDomainStorage();
        const testId = 'cross-domain-id-123';
        storage.setTelemetryId(testId);

        const result = handleCrossDomainTelemetryId();

        expect(result).toBe(testId);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('zId', testId);
    });

    it('returns null when no zId available', () => {
        const result = handleCrossDomainTelemetryId();
        expect(result).toBeNull();
    });

    it('does not crash on errors', () => {
        const originalDocument = global.document;
        // @ts-expect-error - Intentionally deleting global.document for testing
        delete global.document;

        expect(() => {
            const result = handleCrossDomainTelemetryId('test-id');
            expect(result).toBe('test-id');
        }).not.toThrow();

        global.document = originalDocument;
    });
});
