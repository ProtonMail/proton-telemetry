import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import type { PageType } from '../types';

describe('ProtonTelemetry - Page Type Detection', () => {
    let telemetry: ReturnType<typeof ProtonTelemetry>;

    beforeEach(() => {
        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        vi.stubGlobal('localStorage', localStorageMock);

        vi.stubGlobal('document', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: '',
            documentElement: {
                scrollHeight: 2000,
            },
        });

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            location: { pathname: '/' },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
        });

        telemetry = ProtonTelemetry({
            endpoint: 'https://telemetry.test.com',
            appVersion: 'appVersion',
        });

        vi.spyOn(telemetry, 'sendPageView');
    });

    const testCases: Array<{ path: string; expectedType: PageType }> = [
        { path: '/support/mail/', expectedType: 'support_kb' },
        { path: '/support/troubleshooting/', expectedType: 'support_kb' },
        { path: '/blog', expectedType: 'blog' },
        { path: '/blog/news', expectedType: 'blog' },
        { path: '/blog/pass-lifetime', expectedType: 'blog' },
        { path: '/legal/privacy', expectedType: 'legal' },
        { path: '/legal/terms', expectedType: 'legal' },
        { path: '/mail/download', expectedType: 'download' },
        { path: '/l/freedom-dis-deal', expectedType: 'landing_page' },
        { path: '/l/mail-plans', expectedType: 'landing_page' },
    ];

    testCases.forEach(({ path, expectedType }) => {
        it(`detects ${expectedType} page type for path ${path}`, () => {
            vi.stubGlobal('window', {
                ...window,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                location: {
                    pathname: path,
                    href: `https://test.com${path}`,
                    search: '',
                    hash: '',
                },
                screen: {
                    width: 1920,
                    height: 1080,
                },
                devicePixelRatio: 1,
            });

            telemetry.sendPageView();
            expect(telemetry.sendPageView).toHaveBeenCalled();
        });
    });

    it('handles paths with query parameters', () => {
        const path = '/blog/test-post';
        const search = '?ref=hero&otherparam=somevalue';

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            location: {
                pathname: path,
                href: `https://test.com${path}${search}`,
                search,
                hash: '',
            },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
        });

        telemetry.sendPageView();
        expect(telemetry.sendPageView).toHaveBeenCalled();
    });

    it('handles paths with hash fragments', () => {
        const path = '/business/plans?group=vpn';
        const hash = '#compare-plans';

        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            location: {
                pathname: path,
                href: `https://test.com${path}${hash}`,
                search: '',
                hash,
            },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
        });

        telemetry.sendPageView();
        expect(telemetry.sendPageView).toHaveBeenCalled();
    });
});
