import { createEventSender } from './eventSender';
import { createPerformanceObserver } from './performanceObserver';
import type {
    TelemetryConfig,
    TelemetryEvent,
    BatchedTelemetryEvents,
    QueuedEvent,
    EventType,
    CustomEventData,
    CustomEventType,
    StandardEventType,
} from './types';
import {
    fetchWithHeaders,
    generateMessageId,
    getFormattedUTCTimezone,
} from './utils';
import { createSendData } from './sendData';

export const createTelemetry = (config: TelemetryConfig) => {
    const state = {
        config: {
            debug: false,
            dryRun: false,
            events: {
                pageView: true,
                click: true,
                form: false,
                performance: true,
                visibility: true,
                modal: false,
            },
            ...config,
        } as Required<TelemetryConfig>,
        aId: '',
        pageLoadTime: 0,
        userTimezone: '',
        userLanguage: '',
        isInitialized: false,
        eventQueue: [] as QueuedEvent[],
        batchTimeout: null as NodeJS.Timeout | null,
        retryCount: 0,
    };

    function shouldSend(): boolean {
        const dnt = navigator.doNotTrack || window.doNotTrack;
        const gpc = navigator.globalPrivacyControl;
        const shouldSend = !(dnt === '1' || dnt === 'yes' || gpc === true);

        if (!shouldSend && localStorage.getItem('aId')) {
            localStorage.removeItem('aId');
        }

        return shouldSend;
    }

    const sendData = createSendData(
        {
            config: {
                debug: state.config.debug,
                dryRun: state.config.dryRun,
                endpoint: state.config.endpoint,
                appVersion: state.config.appVersion,
            },
            eventQueue: state.eventQueue,
            batchTimeout: state.batchTimeout,
            retryCount: state.retryCount,
        },
        {
            createEventPayload,
        }
    );

    function createEventPayload(
        eventType: EventType,
        eventData: Record<string, unknown>,
        customData?: Record<string, unknown>
    ): TelemetryEvent {
        const urlParams = new URLSearchParams(window.location.search);
        const queryParams: Record<string, string> = {};
        urlParams.forEach((value, key) => {
            queryParams[key] = value;
        });

        const now = new Date();
        const utcTimestamp = now.toISOString().replace('Z', '+00:00');

        const offset = -now.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offset) / 60)
            .toString()
            .padStart(2, '0');
        const offsetMinutes = (Math.abs(offset) % 60)
            .toString()
            .padStart(2, '0');
        const offsetSign = offset >= 0 ? '+' : '-';
        const localTimestamp = new Date(
            now.getTime() - now.getTimezoneOffset() * 60000
        )
            .toISOString()
            .replace('Z', `${offsetSign}${offsetHours}:${offsetMinutes}`);

        return {
            aId: state.aId,
            messageId: generateMessageId(),
            clientEventTimestampUtc: utcTimestamp,
            clientEventTimestampLocal: localTimestamp,
            eventType,
            context: {
                campaign: {
                    name: urlParams.get('utm_campaign') || '',
                    source: urlParams.get('utm_source') || '',
                    medium: urlParams.get('utm_medium') || '',
                    term: urlParams.get('utm_term') || '',
                    content: urlParams.get('utm_content') || '',
                },
                library: {
                    name: 'proton-telemetry',
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
                    type: '',
                    name: '',
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

    function getOrCreateAId(): string {
        const storageKey = 'aId';
        const stored = localStorage.getItem(storageKey);

        if (stored) {
            state.aId = stored;
            return stored;
        }

        const newId = generateMessageId();
        localStorage.setItem(storageKey, newId);
        state.aId = newId;

        void sendData('random_uid_created', {}, undefined, 'low');

        return newId;
    }

    if (shouldSend()) {
        state.aId = getOrCreateAId();
        state.pageLoadTime = performance.now();
        state.userTimezone = getFormattedUTCTimezone();
        state.userLanguage = navigator.language || 'en';
    }

    const eventSender = createEventSender(
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
        shouldSend
    );
    const performanceObserver = createPerformanceObserver(sendData);

    if (shouldSend()) {
        if (state.config.events.pageView) {
            eventSender.sendPageView();
        }

        if (state.config.events.click) {
            eventSender.initClickSending();
        }

        if (state.config.events.performance) {
            performanceObserver.initializeObserver();
        }
    }

    return {
        sendPageView: () => {
            if (!shouldSend()) return;
            eventSender.sendPageView();
        },
        sendClicks: () => {
            if (!shouldSend()) return;
            eventSender.initClickSending();
        },
        sendForms: () => {
            if (!shouldSend()) return;
            eventSender.initFormSending();
        },
        sendModalView: (
            modalId: string,
            modalType: 'on_click' | 'exit_intent'
        ) => {
            if (!shouldSend()) return;
            eventSender.sendModalView(modalId, modalType);
        },
        sendCustomEvent: (
            eventType: Exclude<string, StandardEventType>,
            properties: CustomEventData,
            customData?: Record<string, unknown>
        ) => {
            if (!shouldSend()) return;
            void sendData(eventType as CustomEventType, properties, customData);
        },
        destroy: async () => {
            if (state.batchTimeout) {
                clearTimeout(state.batchTimeout);
            }

            if (state.eventQueue.length > 0) {
                const batchedEvents: BatchedTelemetryEvents = {
                    events: state.eventQueue.map(
                        (queuedEvent) => queuedEvent.event
                    ),
                };

                try {
                    await fetchWithHeaders(
                        state.config.endpoint,
                        state.config.appVersion,
                        {
                            method: 'POST',
                            body: JSON.stringify(batchedEvents),
                            keepalive: true,
                        }
                    );
                    state.eventQueue = [];
                } catch (error) {
                    if (state.config.debug) {
                        console.error('Telemetry error:', error);
                    }
                }
            }

            eventSender.destroy();
        },
    };
};

export const createCustomEventSender = (
    telemetry: ReturnType<typeof createTelemetry>,
    eventType: string,
    properties: CustomEventData = {},
    customData: Record<string, unknown> = {}
) => {
    return () => telemetry.sendCustomEvent(eventType, properties, customData);
};
