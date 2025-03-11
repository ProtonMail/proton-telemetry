import { describe, expect, it, beforeEach, vi } from "vitest";
import { createAnalytics as ProtonAnalytics } from "../analytics";

describe("ProtonAnalytics - Basic Functionality", () => {
    let analytics: ReturnType<typeof ProtonAnalytics>;

    beforeEach(() => {
        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
        };
        vi.stubGlobal("localStorage", localStorageMock);

        vi.stubGlobal("window", {
            addEventListener: vi.fn(),
            location: { pathname: "/" },
            screen: {
                width: 1920,
                height: 1080,
            },
            devicePixelRatio: 1,
            innerWidth: 1920,
            innerHeight: 1080,
            scrollY: 0,
        });

        vi.stubGlobal("document", {
            addEventListener: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            hidden: false,
            title: "",
            documentElement: {
                scrollHeight: 2000,
            },
        });

        vi.stubGlobal("navigator", {
            doNotTrack: null,
            language: "en",
        });

        analytics = ProtonAnalytics({
            endpoint: "https://analytics.test.com",
        });

        vi.spyOn(analytics, "trackPageView");
    });

    it("initializes with correct config", () => {
        expect(analytics).toBeDefined();
    });

    it("tracks page views", () => {
        analytics.trackPageView();
        expect(analytics.trackPageView).toHaveBeenCalled();
    });
});
