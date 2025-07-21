import { createEventSender } from './eventSender';
import { createPerformanceObserver } from './performanceObserver';
import type {
    TelemetryConfig,
    TelemetryEvent,
    BatchedTelemetryEvents,
    QueuedEvent,
    EventType,
    CustomEventType,
    StandardEventType,
} from './types';
import {
    fetchWithHeaders,
    generateMessageId,
    getFormattedUTCTimezone,
    safeDocument,
    safeWindow,
    safeNavigator,
    safePerformance,
    log,
    logWarn,
} from './utils';
import { createSendData } from './sendData';
import { createConfig } from './config/utils';
import {
    handleCrossDomainTelemetryId,
    createCrossDomainStorage,
    initCrossDomainTracking,
} from './crossDomainStorage';
import {
    setPageTitleOverride,
    clearPageTitleOverride,
    getTelemetryEnabled,
    setTelemetryEnabled as setTelemetryEnabledStorage,
} from './utils/storage';

export type CreateTelemetryReturn = {
    sendPageView: () => void;
    sendClicks: () => void;
    sendForms: () => void;
    sendModalView: (
        modalId: string,
        modalType: 'on_click' | 'exit_intent',
    ) => void;
    sendCustomEvent: (
        eventType: Exclude<string, StandardEventType>,
        customData?: Record<string, unknown>,
    ) => void;
    setTelemetryEnabled: (enabled: boolean) => void;
    destroy: () => Promise<void>;
};

export const createTelemetry = (
    userConfig: TelemetryConfig,
): CreateTelemetryReturn => {
    const config = createConfig(userConfig);

    const state = {
        aId: '',
        pageLoadTime: 0,
        userTimezone: '',
        userLanguage: '',
        isInitialized: false,
        eventQueue: [] as QueuedEvent[],
        batchTimeout: null as NodeJS.Timeout | null,
        retryCount: 0,
        destroyCrossDomainTracking: () => {},
    };

    function isLocalStorageAvailable(): boolean {
        try {
            const testKey = '__proton_telemetry_test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            logWarn(true, 'Error checking localStorage availability', e);
            return false;
        }
    }

    // Cleanup tracking identifiers when telemetry is disabled
    function cleanupTrackingIdentifiers(): void {
        try {
            // Clean up localStorage aId
            if (
                typeof localStorage !== 'undefined' &&
                localStorage.getItem('aId')
            ) {
                localStorage.removeItem('aId');
            }

            // Clean up cross-domain storage
            const crossDomainStorage = createCrossDomainStorage(
                config.crossDomain,
                config.debug,
            );
            crossDomainStorage.cleanupCookie();
        } catch (error) {
            log(config.debug, 'Error cleaning up tracking identifiers:', error);
        }
    }

    function shouldSend(): boolean {
        // Check user telemetry setting first
        const telemetryEnabled = getTelemetryEnabled();
        if (telemetryEnabled === false) {
            cleanupTrackingIdentifiers();
            return false;
        }

        // Existing DNT/GPC checks
        const dnt = safeNavigator.doNotTrack || safeWindow.doNotTrack;
        const gpc = safeNavigator.globalPrivacyControl;
        const baseShouldSend = !(dnt === '1' || dnt === 'yes' || gpc === true);

        if (!baseShouldSend) {
            cleanupTrackingIdentifiers();
            return false;
        }

        return true;
    }

    const sendData = createSendData(
        {
            endpoint: config.endpoint,
            appVersion: config.appVersion,
            debug: config.debug,
            dryRun: config.dryRun,
            uidHeader: config.uidHeader,
        },
        {
            eventQueue: state.eventQueue,
            batchTimeout: state.batchTimeout,
            retryCount: state.retryCount,
        },
        {
            createEventPayload,
        },
    );

    function createEventPayload(
        eventType: EventType,
        eventData?: Record<string, unknown>,
        customData?: Record<string, unknown>,
    ): TelemetryEvent {
        const location = safeWindow.location;
        const urlParams = new URLSearchParams(location.search);
        const queryParams: Record<string, string> = {};
        urlParams.forEach((value, key) => {
            if (key.startsWith('utm_')) {
                // Key is validated against prototype pollution by the check above
                // nosemgrep: gitlab.eslint.detect-object-injection
                queryParams[key] = value;
            }
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
            now.getTime() - now.getTimezoneOffset() * 60_000,
        )
            .toISOString()
            .replace('Z', `${offsetSign}${offsetHours}:${offsetMinutes}`);

        const screen = safeWindow.screen;

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
                    version: config.appVersion,
                },
                browserLocale: state.userLanguage,
                page: {
                    title: safeDocument.title,
                    url: location.href,
                    path: location.pathname,
                    referrer: safeDocument.referrer,
                    queryString: location.search,
                    queryParams,
                },
                referrer: {
                    type: '',
                    name: '',
                    url: safeDocument.referrer,
                },
                screen: {
                    width: screen.width,
                    height: screen.height,
                    density: Number(safeWindow.devicePixelRatio.toFixed(2)),
                },
                timezone: state.userTimezone,
                userAgent: safeNavigator.userAgent,
                features: customData?.features || Object.create(null),
            },
            properties: {
                ...(eventData || {}),
                data: customData,
            },
        };
    }

    function getOrCreateAId(): string {
        // TODO: put in constants file
        const storageKey = 'aId';

        if (isLocalStorageAvailable()) {
            try {
                // First, try to handle cross-domain analytics ID
                let stored = localStorage.getItem(storageKey);
                const crossDomainAId = handleCrossDomainTelemetryId(
                    stored || undefined,
                    config.crossDomain,
                    config.debug,
                );

                if (crossDomainAId && crossDomainAId !== stored) {
                    // Update localStorage with cross-domain aId
                    localStorage.setItem(storageKey, crossDomainAId);
                    stored = crossDomainAId;
                }

                if (stored) {
                    state.aId = stored;

                    // The cookie for the next hop will be set on 'visibilitychange'
                    return stored;
                }

                const newId = generateMessageId();
                localStorage.setItem(storageKey, newId);
                state.aId = newId;

                // The cookie for the next hop will be set on 'visibilitychange'

                if (shouldSend()) {
                    void sendData('random_uid_created', {}, undefined, 'low');
                }
                return newId;
            } catch (error) {
                logWarn(
                    config.debug,
                    'Error accessing localStorage in getOrCreateAId:',
                    error,
                );
                state.aId = generateMessageId();
                return state.aId;
            }
        } else {
            logWarn(
                config.debug,
                'localStorage is not available. aId will not be persisted.',
            );
            state.aId = generateMessageId();
            return state.aId;
        }
    }

    // Initialize page title override from config before any events are sent
    if (config.pageTitle !== undefined) {
        setPageTitleOverride(config.pageTitle);
    } else {
        clearPageTitleOverride();
    }

    // Initialize telemetry enabled from config before any events are sent
    if (config.telemetryEnabled !== undefined) {
        setTelemetryEnabledStorage(config.telemetryEnabled);
    } else {
        // If no config provided but sessionStorage has no value, default to false
        const currentSetting = getTelemetryEnabled();
        if (currentSetting === null) {
            setTelemetryEnabledStorage(false);
        }
    }

    const shouldSendTelemetry = shouldSend();

    if (shouldSendTelemetry) {
        state.aId = getOrCreateAId();
        state.pageLoadTime = safePerformance.now();
        state.userTimezone = getFormattedUTCTimezone();
        state.userLanguage = safeNavigator.language;
        state.destroyCrossDomainTracking = initCrossDomainTracking(
            config.crossDomain,
            config.debug,
        );
    }

    const eventSender = createEventSender(
        sendData,
        state.pageLoadTime,
        {
            pageView: Boolean(config.events.pageView),
            click: Boolean(config.events.click),
            form: Boolean(config.events.form),
            performance: Boolean(config.events.performance),
            visibility: Boolean(config.events.visibility),
            modal: Boolean(config.events.modal),
        },
        shouldSend,
    );
    const performanceObserver = createPerformanceObserver(
        sendData,
        config.debug,
    );

    if (shouldSendTelemetry) {
        if (config.events.pageView) {
            eventSender.sendPageView();
        }

        if (config.events.click) {
            eventSender.initClickSending();
        }

        if (config.events.performance) {
            performanceObserver.initializeObserver();
        }
    }

    const destroy = async (): Promise<void> => {
        if (state.batchTimeout) {
            clearTimeout(state.batchTimeout);
        }

        if (state.eventQueue.length > 0) {
            const batchedEvents: BatchedTelemetryEvents = {
                events: state.eventQueue.map(
                    (queuedEvent) => queuedEvent.event,
                ),
            };

            const body = JSON.stringify(batchedEvents);

            if (navigator.sendBeacon) {
                try {
                    const blob = new Blob([body], {
                        type: 'application/json',
                    });
                    const success = navigator.sendBeacon(config.endpoint, blob);
                    if (success) {
                        state.eventQueue = [];
                        log(
                            config.debug,
                            'Successfully sent batch via sendBeacon.',
                        );
                    } else {
                        // fall back to fetchWithHeaders
                        log(
                            config.debug,
                            'navigator.sendBeacon failed, attempting fallback to fetch.',
                        );
                    }
                } catch (error) {
                    if (config.debug) {
                        log(
                            config.debug,
                            'Error using navigator.sendBeacon, attempting fallback to fetch:',
                            error,
                        );
                    }
                }
            }

            // Fallback or if sendBeacon is not available / failed and queue isn't empty
            if (state.eventQueue.length > 0) {
                try {
                    await fetchWithHeaders(
                        config.endpoint,
                        config.appVersion,
                        config.uidHeader,
                        {
                            method: 'POST',
                            body,
                            keepalive: true,
                        },
                    );
                    state.eventQueue = [];
                } catch (error) {
                    if (config.debug) {
                        log(
                            config.debug,
                            'Telemetry error (fetch fallback):',
                            error,
                        );
                    }
                }
            }
        }

        eventSender.destroy();
        state.destroyCrossDomainTracking();

        // Clean up cross-domain cookie
        const crossDomainStorage = createCrossDomainStorage(
            config.crossDomain,
            config.debug,
        );
        crossDomainStorage.cleanupCookie();
    };

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
            modalType: 'on_click' | 'exit_intent',
        ) => {
            if (!shouldSend()) return;
            eventSender.sendModalView(modalId, modalType);
        },
        sendCustomEvent: (
            eventType: Exclude<string, StandardEventType>,
            customData?: Record<string, unknown>,
        ) => {
            if (!shouldSend()) return;
            void sendData(eventType as CustomEventType, {}, customData);
        },
        setTelemetryEnabled: (enabled: boolean) => {
            setTelemetryEnabledStorage(enabled);
        },
        destroy,
    };
};

export const createCustomEventSender = (
    telemetry: ReturnType<typeof createTelemetry>,
    eventType: string,
    customData: Record<string, unknown> = {},
) => {
    return () => telemetry.sendCustomEvent(eventType, customData);
};

export type CreateTelemetryType = ReturnType<typeof createTelemetry>;
