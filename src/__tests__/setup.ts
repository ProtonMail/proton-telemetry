import { beforeEach, vi } from 'vitest';
import { setupGlobalMocks } from './helpers/setup.ts';

// Call global setup
setupGlobalMocks();

// Default no-op fetch so tests that don't explicitly mock it never perform real
// network requests. Without this, happy-dom logs spam ENOTFOUND
beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    // Silence the library's [Telemetry] own debug logging (expected when tests
    // run with debug: true) to keep test output clean, but let other console
    // output through for debugging
    const isTelemetryLog = (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].startsWith('[Telemetry]');

    (['log', 'warn', 'error'] as const).forEach((method) => {
        const original = console[method].bind(console);
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
            if (!isTelemetryLog(args)) {
                original(...args);
            }
        });
    });
});

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
