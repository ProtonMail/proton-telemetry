import { vi } from 'vitest';
import {
    setupBase64Mocks,
    createCookieMock,
    createDocumentMock,
    createWindowMock,
    createLocalStorageMock,
    setupNavigatorMock,
    setupPerformanceMock,
    setupProcessMock,
} from './mocks';

// Global setup
export const setupGlobalMocks = () => {
    // Mock crypto API
    Object.defineProperty(global, 'crypto', {
        value: {
            randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
        },
    });

    // Mock PerformanceObserver
    class MockPerformanceObserver {
        private callback: PerformanceObserverCallback;

        constructor(callback: PerformanceObserverCallback) {
            this.callback = callback;
        }

        observe() {
            // No-op
        }

        disconnect() {
            // No-op
        }

        takeRecords() {
            return [];
        }
    }

    Object.defineProperty(global, 'PerformanceObserver', {
        value: MockPerformanceObserver,
    });

    // Mock window.doNotTrack
    Object.defineProperty(window, 'doNotTrack', {
        writable: true,
        value: null,
    });

    // Mock navigator properties
    Object.defineProperty(window.navigator, 'doNotTrack', {
        writable: true,
        value: null,
    });

    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
        writable: true,
        value: false,
    });

    // Mock screen properties
    Object.defineProperty(window, 'screen', {
        writable: true,
        value: {
            width: 1920,
            height: 1080,
        },
    });

    // Mock devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: 1,
    });

    // Mock location
    Object.defineProperty(window, 'location', {
        writable: true,
        value: {
            pathname: '/',
            href: 'https://proton.me/',
            search: '',
            hash: '',
        },
    });

    // Mock document.title
    Object.defineProperty(document, 'title', {
        writable: true,
        value: '',
    });
};

// Setup for cross-domain storage tests
export const setupCrossDomainTest = (hostname = 'proton.me') => {
    setupBase64Mocks();

    const mockCookie = createCookieMock();
    const mockDocument = createDocumentMock(mockCookie);
    const mockWindow = createWindowMock(hostname);
    const mockLocalStorage = createLocalStorageMock();

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

    return { mockCookie, mockDocument, mockWindow, mockLocalStorage };
};

// Setup for basic telemetry tests
export const setupBasicTelemetryTest = (
    initialStorage = { zId: 'test-uuid' },
) => {
    const localStorageMock = createLocalStorageMock(initialStorage);
    vi.stubGlobal('localStorage', localStorageMock);

    setupNavigatorMock();
    setupPerformanceMock();
    setupProcessMock();

    return { localStorageMock };
};

// Setup timers for retry/batching tests
export const setupTimers = () => {
    vi.useFakeTimers();
    return () => vi.useRealTimers();
};

// Standard cleanup function
export const cleanupMocks = () => {
    vi.restoreAllMocks();
};
