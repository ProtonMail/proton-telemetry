import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createCrossDomainStorage,
    handleCrossDomainTelemetryId,
} from '../crossDomainStorage';

// Mock btoa and atob for Node.js environment - use 'utf8' encoding
global.btoa = (str: string) => Buffer.from(str, 'utf8').toString('base64');
global.atob = (str: string) => Buffer.from(str, 'base64').toString('utf8');

// Create a proper cookie mock that simulates browser behavior
const createCookieMock = () => {
    let cookies: Record<string, string> = {};
    let lastSetCookie = '';

    return {
        get cookie() {
            return Object.entries(cookies)
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');
        },
        set cookie(cookieString: string) {
            lastSetCookie = cookieString; // Store the last set cookie for testing

            // Parse cookie string and store it
            const parts = cookieString.split(';').map((part) => part.trim());
            const [nameValue] = parts;

            // Handle values that contain '=' (like base64 encoded values)
            const equalIndex = nameValue.indexOf('=');
            if (equalIndex !== -1) {
                const name = nameValue.substring(0, equalIndex);
                const value = nameValue.substring(equalIndex + 1);

                if (name && value !== undefined) {
                    // Check for Max-Age=0 or expired date (cookie deletion)
                    const maxAgePart = parts.find((part) =>
                        part.startsWith('Max-Age='),
                    );
                    const expiresPart = parts.find((part) =>
                        part.startsWith('expires='),
                    );

                    let shouldDelete = false;
                    if (maxAgePart) {
                        // Max-Age=0 means delete
                        if (maxAgePart === 'Max-Age=0') {
                            shouldDelete = true;
                        }
                    }
                    if (expiresPart) {
                        // Check if date is in the past (simplified check for 1970)
                        if (expiresPart.includes('1970')) {
                            shouldDelete = true;
                        }
                    }

                    if (shouldDelete) {
                        delete cookies[name];
                    } else {
                        cookies[name] = value;
                    }
                }
            }
        },
        get lastSetCookie() {
            return lastSetCookie;
        },
        clear() {
            cookies = {};
            lastSetCookie = '';
        },
    };
};

// Mock DOM APIs
const mockCookie = createCookieMock();

const mockDocument = {
    get cookie() {
        return mockCookie.cookie;
    },
    set cookie(value: string) {
        mockCookie.cookie = value;
    },
};

const mockWindow = {
    location: {
        hostname: 'proton.me',
        protocol: 'https:',
    },
};

const mockLocalStorage = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(global, 'document', {
    value: mockDocument,
    writable: true,
});

Object.defineProperty(global, 'window', {
    value: mockWindow,
    writable: true,
});

Object.defineProperty(global, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
});

describe('CrossDomainStorage', () => {
    let storage: ReturnType<typeof createCrossDomainStorage>;

    beforeEach(() => {
        mockCookie.clear();
        mockLocalStorage.clear();
        mockWindow.location.hostname = 'proton.me';
        storage = createCrossDomainStorage({ debug: true });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Domain Detection', () => {
        it('should detect proton.me domain', () => {
            mockWindow.location.hostname = 'proton.me';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.me',
                subdomains: ['account.proton.me', 'lumo.proton.me'],
            });
        });

        it('should detect account.proton.me subdomain', () => {
            mockWindow.location.hostname = 'account.proton.me';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.me',
                subdomains: ['account.proton.me', 'lumo.proton.me'],
            });
        });

        it('should detect protonvpn.com domain', () => {
            mockWindow.location.hostname = 'protonvpn.com';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'protonvpn.com',
                subdomains: ['account.protonvpn.com'],
            });
        });

        it('should return null for unsupported domains', () => {
            mockWindow.location.hostname = 'example.com';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toBeNull();
        });

        it('should detect scientist environments', () => {
            mockWindow.location.hostname = 'alice.proton.black';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.black',
                subdomains: [
                    'alice.proton.black',
                    'account.alice.proton.black',
                    'lumo.alice.proton.black',
                    'protonvpn-com.alice.proton.black',
                    'account.protonvpn-com.alice.proton.black',
                ],
            });
        });

        it('should detect protonvpn scientist environments', () => {
            mockWindow.location.hostname = 'protonvpn-com.bob.proton.black';
            const storage = createCrossDomainStorage();
            const domainInfo = storage.getDomainInfo();

            expect(domainInfo).toEqual({
                rootDomain: 'proton.black',
                subdomains: [
                    'bob.proton.black',
                    'account.bob.proton.black',
                    'lumo.bob.proton.black',
                    'protonvpn-com.bob.proton.black',
                    'account.protonvpn-com.bob.proton.black',
                ],
            });
        });
    });

    describe('Analytics ID Management', () => {
        it('should set and get analytics ID', () => {
            const testId = 'test-analytics-id-123';
            const success = storage.setTelemetryId(testId);

            expect(success).toBe(true);

            const retrieved = storage.getTelemetryId();
            expect(retrieved).toBe(testId);
        });

        it('should return null for non-existent analytics ID', () => {
            const retrieved = storage.getTelemetryId();
            expect(retrieved).toBeNull();
        });

        it('should handle expired analytics ID', async () => {
            vi.useFakeTimers();
            const testId = 'test-analytics-id-456';
            const shortStorage = createCrossDomainStorage({
                maxAge: 1,
                debug: true,
            });

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
    });

    describe('LocalStorage Transfer', () => {
        it('should transfer analytics ID to localStorage', () => {
            const testId = 'test-analytics-id-123';
            storage.setTelemetryId(testId);

            const success = storage.transferToLocalStorage();

            expect(success).toBe(true);
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                'aId',
                testId,
            );
        });

        it('should transfer with custom storage key', () => {
            const testId = 'test-analytics-id-123';
            const customKey = 'customAnalyticsId';
            storage.setTelemetryId(testId);

            const success = storage.transferToLocalStorage(customKey);

            expect(success).toBe(true);
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                customKey,
                testId,
            );
        });

        it('should return false when no analytics ID exists', () => {
            const success = storage.transferToLocalStorage();
            expect(success).toBe(false);
        });
    });

    describe('Cookie Cleanup', () => {
        it('should clean up cookie', () => {
            const testId = 'test-analytics-id-123';
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
    });

    describe('Support Detection', () => {
        it('should detect support when on supported domain', () => {
            mockWindow.location.hostname = 'proton.me';
            const storage = createCrossDomainStorage();

            expect(storage.isSupported()).toBe(true);
        });

        it('should not support when on unsupported domain', () => {
            mockWindow.location.hostname = 'example.com';
            const storage = createCrossDomainStorage();

            expect(storage.isSupported()).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should not crash when document is unavailable', () => {
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

        it('should not crash when localStorage is unavailable', () => {
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
    beforeEach(() => {
        mockCookie.clear();
        mockLocalStorage.clear();
        mockWindow.location.hostname = 'proton.me';
    });

    it('should return current aId when provided', () => {
        const currentId = 'current-id-123';
        const result = handleCrossDomainTelemetryId(currentId);

        expect(result).toBe(currentId);
    });

    it('should retrieve aId from cross-domain cookie when no current aId', () => {
        // Set up a cookie first
        const storage = createCrossDomainStorage();
        const testId = 'cross-domain-id-123';
        storage.setTelemetryId(testId);

        const result = handleCrossDomainTelemetryId();

        expect(result).toBe(testId);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('aId', testId);
    });

    it('should return null when no aId available', () => {
        const result = handleCrossDomainTelemetryId();
        expect(result).toBeNull();
    });

    it('should not crash on errors', () => {
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
