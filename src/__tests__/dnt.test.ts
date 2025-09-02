import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';

describe('ProtonTelemetry - Do Not Track Functionality', () => {
    let localStorageMock: {
        getItem: (key: string) => string | null;
        setItem: (key: string, value: string) => void;
        removeItem: (key: string) => void;
    };
    let mockStorage: Record<string, string>;

    beforeEach(() => {
        mockStorage = {};
        localStorageMock = {
            // nosemgrep: gitlab.eslint.detect-object-injection
            getItem: vi.fn((key: string) => mockStorage[key] ?? null),
            setItem: vi.fn((key: string, value: string) => {
                // nosemgrep: gitlab.eslint.detect-object-injection
                mockStorage[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                // nosemgrep: gitlab.eslint.detect-object-injection
                delete mockStorage[key];
            }),
        };
        vi.stubGlobal('localStorage', localStorageMock);
        vi.restoreAllMocks();

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: '',
            documentElement: {
                scrollHeight: 2000,
            },
        });

        vi.stubGlobal('window', {
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            location: {
                pathname: '/',
                href: 'http://localhost/',
                search: '',
                hash: '',
            },
            addEventListener: vi.fn(),
        });
    });

    it('respects Do Not Track header', () => {
        vi.stubGlobal('navigator', {
            doNotTrack: '1',
            language: 'en',
        });

        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
        });

        // Mock sendPageView to verify it's not actually sending data
        const sendPageViewSpy = vi.spyOn(telemetry, 'sendPageView');

        telemetry.sendPageView();

        expect(localStorage.getItem('zId')).toBeNull();
        expect(sendPageViewSpy).toHaveBeenCalled();
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('respects Global Privacy Control', () => {
        vi.stubGlobal('navigator', {
            globalPrivacyControl: true,
            language: 'en',
        });

        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
        });

        // Mock trackPageView to verify it's not actually sending data
        const sendPageViewSpy = vi.spyOn(telemetry, 'sendPageView');

        telemetry.sendPageView();

        expect(localStorage.getItem('zId')).toBeNull();
        expect(sendPageViewSpy).toHaveBeenCalled();
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('removes existing zId when DNT is enabled', () => {
        // First simulate an existing ID
        mockStorage['zId'] = 'test-id';

        // Then enable DNT
        vi.stubGlobal('navigator', {
            doNotTrack: '1',
            language: 'en',
        });

        const telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
        });

        telemetry.sendPageView();

        expect(localStorage.removeItem).toHaveBeenCalledWith('zId');
        expect(mockStorage['zId']).toBeUndefined();
    });
});
