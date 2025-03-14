import { describe, expect, it, beforeEach, vi } from "vitest";
import { createAnalytics as ProtonAnalytics } from "../analytics";

describe("ProtonAnalytics - Do Not Track Functionality", () => {
    let localStorageMock: { getItem: any; setItem: any; removeItem: any };
    let mockStorage: Record<string, string>;

    beforeEach(() => {
        mockStorage = {};
        localStorageMock = {
            getItem: vi.fn((key: string) => mockStorage[key] ?? null),
            setItem: vi.fn((key: string, value: string) => {
                mockStorage[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                delete mockStorage[key];
            }),
        };
        vi.stubGlobal("localStorage", localStorageMock);
        vi.restoreAllMocks();

        vi.stubGlobal("document", {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: "",
            documentElement: {
                scrollHeight: 2000,
            },
        });

        vi.stubGlobal("window", {
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            location: {
                pathname: "/",
                href: "http://localhost/",
                search: "",
                hash: "",
            },
            addEventListener: vi.fn(),
        });
    });

    it("respects Do Not Track header", () => {
        vi.stubGlobal("navigator", {
            doNotTrack: "1",
            language: "en",
        });

        const analytics = ProtonAnalytics({
            endpoint: "https://analytics.test.com",
            appVersion: 'appVersion',
        });

        // Mock trackPageView to verify it's not actually sending data
        const trackPageViewSpy = vi.spyOn(analytics, "trackPageView");

        analytics.trackPageView();

        expect(localStorage.getItem("aId")).toBeNull();
        expect(trackPageViewSpy).toHaveBeenCalled();
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it("respects Global Privacy Control", () => {
        vi.stubGlobal("navigator", {
            globalPrivacyControl: true,
            language: "en",
        });

        const analytics = ProtonAnalytics({
            endpoint: "https://analytics.test.com",
            appVersion: 'appVersion',
        });

        // Mock trackPageView to verify it's not actually sending data
        const trackPageViewSpy = vi.spyOn(analytics, "trackPageView");

        analytics.trackPageView();

        expect(localStorage.getItem("aId")).toBeNull();
        expect(trackPageViewSpy).toHaveBeenCalled();
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it("removes existing anonymousId when DNT is enabled", () => {
        // First simulate an existing ID
        mockStorage["aId"] = "test-id";

        // Then enable DNT
        vi.stubGlobal("navigator", {
            doNotTrack: "1",
            language: "en",
        });

        const analytics = ProtonAnalytics({
            endpoint: "https://analytics.test.com",
            appVersion: 'appVersion',
        });

        analytics.trackPageView();

        expect(localStorage.removeItem).toHaveBeenCalledWith("aId");
        expect(localStorage.getItem("aId")).toBeNull();
    });
});
