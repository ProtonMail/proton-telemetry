import { vi } from 'vitest';

// Mock btoa and atob for Node.js environment
export const setupBase64Mocks = () => {
    global.btoa = (str: string) => Buffer.from(str, 'utf8').toString('base64');
    global.atob = (str: string) => Buffer.from(str, 'base64').toString('utf8');
};

// Create fetch mock
export const createFetchMock = () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
};

// Create console spies
export const createConsoleMocks = () => {
    const consoleSpyLog = vi.spyOn(console, 'log');
    const consoleSpyError = vi.spyOn(console, 'error');
    return { consoleSpyLog, consoleSpyError };
};

// Create localStorage mock
export const createLocalStorageMock = (
    initialStorage: Record<string, string> = {},
) => {
    let store = { ...initialStorage };

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
        _getStore: () => store, // Helper for testing
        _setStore: (newStore: Record<string, string>) => {
            store = { ...newStore };
        },
    };
};

// Cookie mock for cross-domain testing
export const createCookieMock = () => {
    let cookies: Record<string, string> = {};
    let lastSetCookie = '';

    return {
        get cookie() {
            return Object.entries(cookies)
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');
        },
        set cookie(cookieString: string) {
            lastSetCookie = cookieString;

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
                        if (maxAgePart === 'Max-Age=0') {
                            shouldDelete = true;
                        }
                    }
                    if (expiresPart) {
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

// Create window mock
export const createWindowMock = (
    initialHostname = 'proton.me',
    protocol = 'https:',
) => {
    return {
        location: {
            hostname: initialHostname,
            protocol,
        },
    };
};

// Create document mock with cookie support
export const createDocumentMock = (
    cookieMock: ReturnType<typeof createCookieMock>,
) => {
    return {
        get cookie() {
            return cookieMock.cookie;
        },
        set cookie(value: string) {
            cookieMock.cookie = value;
        },
    };
};

// Setup standard navigation mock
export const setupNavigatorMock = () => {
    vi.stubGlobal('navigator', {
        doNotTrack: null,
        globalPrivacyControl: false,
        language: 'en-US',
    });
};

// Setup performance mock
export const setupPerformanceMock = () => {
    vi.stubGlobal('performance', {
        now: () => 0,
    });
};

// Setup process env mock
export const setupProcessMock = () => {
    vi.stubGlobal('process', {
        env: {
            CI_COMMIT_TAG: 'v1.0.0+test',
        },
    });
};
