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
        // Store callback for later use
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
