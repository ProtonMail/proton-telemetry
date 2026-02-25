import { createEventSender } from './eventSender';
import { createPerformanceObserver } from './performanceObserver';
import type {
    TelemetryConfig,
    TelemetryEvent,
    QueuedEvent,
    EventType,
    CustomEventType,
    StandardEventType,
} from './types';
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
import { attachPageHideFlush, flushQueue } from './flush';

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
        zId: '',
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
                    // write aId for legacy consumers
                    localStorage.setItem('aId', crossDomainZId);
                    stored = crossDomainZId;
                }

                if (stored) {
                    state.zId = stored;

                    // The cookie for the next hop will be set on 'visibilitychange'
                    return stored;
                }

                const newId = generateMessageId();
                localStorage.setItem(storageKey, newId);
                // write aId for legacy consumers
                localStorage.setItem('aId', newId);
                state.zId = newId;

                // The cookie for the next hop will be set on 'visibilitychange'

                if (shouldSend()) {
                    void sendData('random_uid_created', {}, undefined, 'high');
                }
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

    let detachPageHideFlush: () => void = () => {};

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

        // Add a pagehide flush to reduce event loss on navigation
        try {
            const flush = async () => {
                try {
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
                    );
                } catch {
                    // ignore flush errors
                }
            };
            detachPageHideFlush = attachPageHideFlush(flush);
        } catch {
            // ignore addEventListener issues
        }
    }

    const destroy = async (): Promise<void> => {
        if (state.batchTimeout) {
            clearTimeout(state.batchTimeout);
        }

        if (state.eventQueue.length > 0) {
            try {
                await flushQueue(
                    config.endpoint,
                    config.appVersion,
                    config.uidHeader,
                    config.debug,
                    state.eventQueue,
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

        eventSender.destroy();
        detachPageHideFlush();
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
