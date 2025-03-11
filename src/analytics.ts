import { createEventTracker } from "./eventTracker";
import { createPerformanceTracker } from "./performanceTracker";
import type {
    AnalyticsConfig,
    AnalyticsEvent,
    BatchedAnalyticsEvents,
    EventPriority,
    QueuedEvent,
    EventType,
    EventData,
    CustomEventData,
    CustomEventType,
    StandardEventType,
} from "./types";
import {
    fetchWithHeaders,
    generateMessageId,
    getFormattedUTCTimezone,
} from "./utils";
import { version as packageVersion } from "../package.json";

export const createAnalytics = (config: AnalyticsConfig) => {
    const state = {
        config: {
            debug: false,
            dryRun: false,
            appVersion: packageVersion,
            events: {
                pageView: true,
                click: true,
                form: false,
                performance: true,
                visibility: true,
                modal: false,
            },
            ...config,
        } as Required<AnalyticsConfig>,
        anonymousId: "",
        pageLoadTime: 0,
        userTimezone: "",
        userLanguage: "",
        isInitialized: false,
        eventQueue: [] as QueuedEvent[],
        batchTimeout: null as NodeJS.Timeout | null,
        BATCH_DELAY: 200,
    };

    function shouldTrack(): boolean {
        const dnt = navigator.doNotTrack || window.doNotTrack;
        const gpc = navigator.globalPrivacyControl;
        const shouldTrack = !(dnt === "1" || dnt === "yes" || gpc === true);

        if (!shouldTrack && localStorage.getItem("aId")) {
            localStorage.removeItem("aId");
        }

        return shouldTrack;
    }

    async function sendData(
        eventType: EventType,
        eventData: EventData,
        customData?: Record<string, unknown>,
        priority: EventPriority = "high"
    ): Promise<boolean> {
        const event = createEventPayload(eventType, eventData, customData);

        if (state.config.dryRun) {
            // eslint-disable-next-line no-console
            console.log("[DRY RUN] event:", event);
            return true;
        }

        state.eventQueue.push({ event, priority });

        if (state.batchTimeout) {
            clearTimeout(state.batchTimeout);
        }

        return new Promise((resolve) => {
            state.batchTimeout = setTimeout(async () => {
                try {
                    if (state.eventQueue.length === 0) {
                        resolve(true);
                        return;
                    }

                    const hasHighPriorityEvents = state.eventQueue.some(
                        (queuedEvent) => queuedEvent.priority === "high"
                    );

                    if (!hasHighPriorityEvents) {
                        resolve(true);
                        return;
                    }

                    const batchedEvents: BatchedAnalyticsEvents = {
                        events: state.eventQueue.map(
                            (queuedEvent) => queuedEvent.event
                        ),
                    };

                    const response = await fetchWithHeaders(
                        state.config.endpoint,
                        {
                            method: "POST",
                            body: JSON.stringify(batchedEvents),
                            keepalive: true,
                        }
                    );

                    if (response.ok) {
                        state.eventQueue = [];
                    }

                    resolve(response.ok);
                } catch (error) {
                    if (state.config.debug) {
                        console.error("Analytics error:", error);
                    }
                    resolve(false);
                }
            }, state.BATCH_DELAY);
        });
    }

    function createEventPayload(
        eventType: EventType,
        eventData: Record<string, unknown>,
        customData?: Record<string, unknown>
    ): AnalyticsEvent {
        const urlParams = new URLSearchParams(window.location.search);
        const queryParams: Record<string, string> = {};
        urlParams.forEach((value, key) => {
            queryParams[key] = value;
        });

        const now = new Date();
        const utcTimestamp = now.toISOString().replace("Z", "+00:00");

        const offset = -now.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offset) / 60)
            .toString()
            .padStart(2, "0");
        const offsetMinutes = (Math.abs(offset) % 60)
            .toString()
            .padStart(2, "0");
        const offsetSign = offset >= 0 ? "+" : "-";
        const localTimestamp = new Date(
            now.getTime() - now.getTimezoneOffset() * 60000
        )
            .toISOString()
            .replace("Z", `${offsetSign}${offsetHours}:${offsetMinutes}`);

        return {
            anonymousId: state.anonymousId,
            messageId: generateMessageId(),
            clientEventTimestampUtc: utcTimestamp,
            clientEventTimestampLocal: localTimestamp,
            eventType,
            context: {
                campaign: {
                    name: urlParams.get("utm_campaign") || "",
                    source: urlParams.get("utm_source") || "",
                    medium: urlParams.get("utm_medium") || "",
                    term: urlParams.get("utm_term") || "",
                    content: urlParams.get("utm_content") || "",
                },
                library: {
                    name: "proton-analytics",
                    version: state.config.appVersion,
                },
                browserLocale: state.userLanguage,
                page: {
                    title: document.title,
                    url: window.location.href,
                    path: window.location.pathname,
                    referrer: document.referrer,
                    queryString: window.location.search,
                    queryParams,
                },
                referrer: {
                    type: "",
                    name: "",
                    url: document.referrer,
                },
                screen: {
                    width: window.screen.width,
                    height: window.screen.height,
                    density: Number(window.devicePixelRatio.toFixed(2)),
                },
                timezone: state.userTimezone,
                userAgent: navigator.userAgent,
                features: customData?.features || Object.create(null),
            },
            properties: {
                ...eventData,
                data: customData,
            },
        };
    }

    function getOrCreateAnonymousId(): string {
        const storageKey = "aId";
        const stored = localStorage.getItem(storageKey);

        if (stored) {
            state.anonymousId = stored;
            return stored;
        }

        const newId = generateMessageId();
        localStorage.setItem(storageKey, newId);
        state.anonymousId = newId;

        void sendData("random_uid_created", {}, undefined, "low");

        return newId;
    }

    if (shouldTrack()) {
        state.anonymousId = getOrCreateAnonymousId();
        state.pageLoadTime = performance.now();
        state.userTimezone = getFormattedUTCTimezone();
        state.userLanguage = navigator.language || "en";
    }

    const eventTracker = createEventTracker(
        sendData,
        state.pageLoadTime,
        {
            pageView: Boolean(state.config.events.pageView),
            click: Boolean(state.config.events.click),
            form: Boolean(state.config.events.form),
            performance: Boolean(state.config.events.performance),
            visibility: Boolean(state.config.events.visibility),
            modal: Boolean(state.config.events.modal),
        },
        shouldTrack
    );
    const performanceTracker = createPerformanceTracker(sendData);

    if (shouldTrack()) {
        if (state.config.events.pageView) {
            eventTracker.trackPageView();
        }

        if (state.config.events.click) {
            eventTracker.initClickTracking();
        }

        if (state.config.events.performance) {
            performanceTracker.initializeObserver();
        }
    }

    return {
        trackPageView: () => {
            if (!shouldTrack()) return;
            eventTracker.trackPageView();
        },
        trackClicks: () => {
            if (!shouldTrack()) return;
            eventTracker.initClickTracking();
        },
        trackForms: () => {
            if (!shouldTrack()) return;
            eventTracker.initFormTracking();
        },
        trackModalView: (
            modalId: string,
            modalType: "on_click" | "exit_intent"
        ) => {
            if (!shouldTrack()) return;
            eventTracker.trackModalView(modalId, modalType);
        },
        trackCustomEvent: (
            eventType: Exclude<string, StandardEventType>,
            properties: CustomEventData,
            customData: Record<string, unknown>
        ) => {
            if (!shouldTrack()) return;
            void sendData(eventType as CustomEventType, properties, customData);
        },
        destroy: async () => {
            if (state.batchTimeout) {
                clearTimeout(state.batchTimeout);
            }

            if (state.eventQueue.length > 0) {
                const batchedEvents: BatchedAnalyticsEvents = {
                    events: state.eventQueue.map(
                        (queuedEvent) => queuedEvent.event
                    ),
                };

                try {
                    await fetchWithHeaders(state.config.endpoint, {
                        method: "POST",
                        body: JSON.stringify(batchedEvents),
                        keepalive: true,
                    });
                    state.eventQueue = [];
                } catch (error) {
                    if (state.config.debug) {
                        console.error("Analytics error:", error);
                    }
                }
            }

            eventTracker.destroy();
        },
    };
};

export const createCustomEventTracker = (
    analytics: ReturnType<typeof createAnalytics>,
    eventType: string,
    properties: CustomEventData = {},
    customData: Record<string, unknown> = {}
) => {
    return () => analytics.trackCustomEvent(eventType, properties, customData);
};
