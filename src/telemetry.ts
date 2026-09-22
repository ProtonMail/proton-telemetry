import { createEventSender } from './eventSender.ts';
import { createPerformanceObserver } from './performanceObserver.ts';
import type {
    TelemetryConfig,
    TelemetryEvent,
    QueuedEvent,
    EventType,
    CustomEventType,
    StandardEventType,
} from './types/index.ts';
import {
    generateMessageId,
    getFormattedUTCTimezone,
    safeDocument,
    safeWindow,
    safeNavigator,
    safePerformance,
    log,
    logWarn,
    logError,
} from './utils/index.ts';
import { createSendData } from './sendData.ts';
import { createPendingEventsStore } from './pendingEvents.ts';
import { createConfig } from './config/utils.ts';
import {
    handleCrossDomainTelemetryId,
    createCrossDomainStorage,
    initCrossDomainTracking,
} from './crossDomainStorage.ts';
import {
    setPageTitleOverride,
    clearPageTitleOverride,
    getTelemetryEnabled,
    setTelemetryEnabled as setTelemetryEnabledStorage,
} from './utils/storage.ts';
import { attachPageLifecycleFlush, flushQueue } from './flush.ts';

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
    let createdNewZId = false;

    const state = {
        zId: '',
        pageLoadTime: 0,
        userTimezone: '',
        userLanguage: '',
        isInitialized: false,
        eventQueue: [] as QueuedEvent[],
        batchTimeout: null as NodeJS.Timeout | null,
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
        if (!config.dryRun) {
            cancelPendingSends();
            state.eventQueue.length = 0;
            try {
                pendingEvents.clear();
            } catch (error) {
                log(config.debug, 'Error clearing pending events:', error);
            }
        }

        try {
            // Clean up localStorage zId
            if (
                typeof localStorage !== 'undefined' &&
                localStorage.getItem('zId')
            ) {
                localStorage.removeItem('zId');
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

    // Events sent under a session header are never persisted. Ingestion
    // attaches a user id to any request carrying x-pm-uid, and logged-in apps
    // create a new instance per session change in the same tab, so a
    // restored event could be attributed to a session it was not created in.
    const pendingEvents = createPendingEventsStore(
        config.debug,
        !config.uidHeader,
    );
    const { sendData, sendBatch, cancelPendingSends } = createSendData(
        {
            endpoint: config.endpoint,
            appVersion: config.appVersion,
            debug: config.debug,
            dryRun: config.dryRun,
            uidHeader: config.uidHeader,
        },
        state,
        {
            pendingEvents,
            shouldSend,
            createEventPayload,
        },
    );

    function applySanitization(rawUrl: string): URL | null {
        if (!config.urlSanitization) {
            return null;
        }

        let parsed: URL;
        try {
            parsed = new URL(rawUrl);
        } catch {
            return null;
        }

        if (config.urlSanitization.stripHash) {
            parsed.hash = '';
        }

        if (config.urlSanitization.sanitizeUrl) {
            try {
                parsed = config.urlSanitization.sanitizeUrl(parsed);
            } catch (error) {
                logError(
                    config.debug,
                    'Error in urlSanitization.sanitizeUrl callback, using pre-callback URL:',
                    error,
                );
            }
        }

        return parsed;
    }

    function createEventPayload(
        eventType: EventType,
        eventData?: Record<string, unknown>,
        customData?: Record<string, unknown>,
    ): TelemetryEvent {
        const rawLocation = safeWindow.location;

        const sanitizedUrl = applySanitization(rawLocation.href);
        const sanitizedHref = sanitizedUrl?.href ?? rawLocation.href;
        const sanitizedPathname =
            sanitizedUrl?.pathname ?? rawLocation.pathname;
        const sanitizedSearch = sanitizedUrl?.search ?? rawLocation.search;

        const sanitizedReferrerUrl = applySanitization(safeDocument.referrer);
        const sanitizedReferrer =
            sanitizedReferrerUrl?.href ?? safeDocument.referrer;

        const urlParams = new URLSearchParams(sanitizedSearch);
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

        // Sanitize URL fields in eventData (path, referrer, elementHref)
        const sanitizedEventData = eventData ? { ...eventData } : {};
        if (typeof sanitizedEventData.path === 'string') {
            sanitizedEventData.path = sanitizedPathname;
        }
        if (typeof sanitizedEventData.referrer === 'string') {
            sanitizedEventData.referrer = sanitizedReferrer;
        }
        if (typeof sanitizedEventData.elementHref === 'string') {
            sanitizedEventData.elementHref =
                applySanitization(sanitizedEventData.elementHref)?.href ??
                sanitizedEventData.elementHref;
        }
        return {
            zId: state.zId,
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
                    url: sanitizedHref,
                    path: sanitizedPathname,
                    referrer: sanitizedReferrer,
                    queryString: sanitizedSearch,
                    queryParams,
                },
                referrer: {
                    type: '',
                    name: '',
                    url: sanitizedReferrer,
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
                ...sanitizedEventData,
                data: customData,
            },
        };
    }

    function getOrCreateZId(): string {
        // TODO: put in constants file
        const storageKey = 'zId';

        if (isLocalStorageAvailable()) {
            try {
                // First, try to handle cross-domain analytics ID
                let stored = localStorage.getItem(storageKey);
                const crossDomainZId = handleCrossDomainTelemetryId(
                    stored || undefined,
                    config.crossDomain,
                    config.debug,
                );

                if (crossDomainZId && crossDomainZId !== stored) {
                    localStorage.setItem(storageKey, crossDomainZId);
                    stored = crossDomainZId;
                }

                if (stored) {
                    state.zId = stored;

                    // The cookie for the next hop will be set on 'visibilitychange'
                    return stored;
                }

                const newId = generateMessageId();
                localStorage.setItem(storageKey, newId);
                state.zId = newId;
                createdNewZId = true;

                // The cookie for the next hop will be set on 'visibilitychange'

                return newId;
            } catch (error) {
                logWarn(
                    config.debug,
                    'Error accessing localStorage in getOrCreateZId:',
                    error,
                );
                state.zId = generateMessageId();
                return state.zId;
            }
        } else {
            logWarn(
                config.debug,
                'localStorage is not available. zId will not be persisted.',
            );
            state.zId = generateMessageId();
            return state.zId;
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
        state.zId = getOrCreateZId();
        state.pageLoadTime = safePerformance.now();
        state.userTimezone = getFormattedUTCTimezone();
        state.userLanguage = safeNavigator.language;
        state.destroyCrossDomainTracking = initCrossDomainTracking(
            config.crossDomain,
            config.debug,
        );
        if (!config.dryRun) {
            const restoredEvents = pendingEvents.read();
            if (restoredEvents.length > 0) {
                void sendBatch(restoredEvents, { keepalive: false });
            }
        }
        if (createdNewZId && shouldSend()) {
            void sendData('random_uid_created', {}, undefined, 'high');
        }
    }

    const eventSender = createEventSender(
        sendData,
        state.pageLoadTime,
        {
            pageView: Boolean(config.events.pageView),
            click: Boolean(config.events.click),
            form: Boolean(config.events.form),
            performance: Boolean(config.events.performance),
            modal: Boolean(config.events.modal),
            exit: Boolean(config.events.exit),
        },
        shouldSend,
    );
    const performanceObserver = createPerformanceObserver(
        sendData,
        config.debug,
    );

    let detachPageLifecycleFlush: () => void = () => {};

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

        // Add a page lifecycle flush to reduce event loss on navigation
        try {
            const flush = async () => {
                try {
                    if (!shouldSend()) return;
                    if (state.batchTimeout) {
                        clearTimeout(state.batchTimeout);
                        state.batchTimeout = null;
                    }
                    await flushQueue(
                        config.endpoint,
                        config.appVersion,
                        config.uidHeader,
                        config.debug,
                        state.eventQueue,
                        pendingEvents,
                        shouldSend,
                    );
                } catch {
                    // ignore flush errors
                }
            };
            detachPageLifecycleFlush = attachPageLifecycleFlush(flush);
        } catch {
            // ignore addEventListener issues
        }
    }

    const destroy = async (): Promise<void> => {
        eventSender.destroy();
        detachPageLifecycleFlush();
        performanceObserver.disconnectObservers();
        state.destroyCrossDomainTracking();
        cancelPendingSends();

        if (shouldSend() && state.eventQueue.length > 0) {
            try {
                await flushQueue(
                    config.endpoint,
                    config.appVersion,
                    config.uidHeader,
                    config.debug,
                    state.eventQueue,
                    pendingEvents,
                    shouldSend,
                );
            } catch (error) {
                if (config.debug) {
                    log(
                        config.debug,
                        'Telemetry error during destroy flush:',
                        error,
                    );
                }
            }
        }

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
            if (!enabled) {
                cleanupTrackingIdentifiers();
            }
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
