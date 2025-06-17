// Cross-domain ID management using cookies for Proton domains
// Supports any subdomain under proton.me, protonvpn.com, and proton.black
import type { CrossDomainStorageConfig } from './types';
import { log, logError, logWarn } from './utils';

interface DomainInfo {
    rootDomain: string;
}

interface CrossDomainStorageInstance {
    setTelemetryId: (aId: string) => boolean;
    getTelemetryId: () => string | null;
    transferToLocalStorage: (storageKey?: string) => boolean;
    cleanupCookie: () => void;
    isSupported: () => boolean;
    getDomainInfo: () => DomainInfo | null;
}

// Supported root domains
const SUPPORTED_DOMAINS = ['proton.me', 'protonvpn.com', 'proton.black'];

const DEFAULT_CONFIG: Required<CrossDomainStorageConfig> = {
    cookieName: 'aId',
    maxAge: 300,
};

// Detect current domain configuration
const detectDomainInfo = (): DomainInfo | null => {
    try {
        if (typeof window === 'undefined' || !window.location) {
            return null;
        }

        const hostname = window.location.hostname.toLowerCase();

        // Check each supported domain
        for (const domain of SUPPORTED_DOMAINS) {
            if (hostname === domain || hostname.endsWith(`.${domain}`)) {
                return {
                    rootDomain: domain,
                };
            }
        }

        return null;
    } catch {
        return null;
    }
};

// Create encoded cookie value with timestamp
const createCookieValue = (aId: string): string => {
    const data = {
        aId,
        timestamp: Date.now(),
        version: 1,
    };
    return btoa(JSON.stringify(data));
};

// Parse encoded cookie value
const parseCookieValue = (
    cookieValue: string,
): { aId: string; timestamp: number } | null => {
    try {
        const decoded = atob(cookieValue);
        const data = JSON.parse(decoded);

        if (
            data &&
            typeof data.aId === 'string' &&
            typeof data.timestamp === 'number'
        ) {
            return { aId: data.aId, timestamp: data.timestamp };
        }

        return null;
    } catch {
        return null;
    }
};

// Check if cookie value is expired
const isExpired = (timestamp: number, maxAge: number): boolean => {
    return Date.now() - timestamp > maxAge * 1000;
};

// Build cookie string with security attributes
const buildCookieString = (
    value: string,
    cookieName: string,
    maxAge: number,
    rootDomain: string,
): string => {
    const parts = [
        `${cookieName}=${value}`,
        `Max-Age=${maxAge}`,
        `Domain=.${rootDomain}`,
        'Path=/',
        'SameSite=Lax',
    ];

    // Add Secure flag if on HTTPS
    try {
        if (
            typeof window !== 'undefined' &&
            window.location &&
            window.location.protocol === 'https:'
        ) {
            parts.push('Secure');
        }
    } catch {
        // Silently continue without Secure flag
    }

    return parts.join('; ');
};

// Get raw cookie value
const getCookieValue = (cookieName: string): string | null => {
    try {
        if (typeof document === 'undefined') {
            return null;
        }

        const name = cookieName + '=';
        const cookies = document.cookie.split(';');

        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith(name)) {
                return cookie.substring(name.length);
            }
        }

        return null;
    } catch {
        return null;
    }
};

// Create a cross-domain storage instance
export const createCrossDomainStorage = (
    config: CrossDomainStorageConfig = {},
    debug = false,
): CrossDomainStorageInstance => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const domainInfo = detectDomainInfo();

    const setTelemetryId = (aId: string): boolean => {
        try {
            if (!domainInfo || !aId || typeof document === 'undefined') {
                log(
                    debug,
                    'Cannot set telemetry ID: missing domain info or aId',
                );
                return false;
            }

            const cookieValue = createCookieValue(aId);
            const cookieString = buildCookieString(
                cookieValue,
                finalConfig.cookieName,
                finalConfig.maxAge,
                domainInfo.rootDomain,
            );

            document.cookie = cookieString;
            log(debug, 'Set telemetry ID cookie:', cookieValue);

            return verifyWriteSuccess(aId);
        } catch (error) {
            log(debug, 'Error setting telemetry ID:', error);
            return false;
        }
    };

    const getTelemetryId = (): string | null => {
        try {
            if (typeof document === 'undefined') {
                return null;
            }

            const cookieValue = getCookieValue(finalConfig.cookieName);
            if (!cookieValue) {
                return null;
            }

            const parsed = parseCookieValue(cookieValue);
            if (!parsed || isExpired(parsed.timestamp, finalConfig.maxAge)) {
                cleanupCookie();
                return null;
            }

            log(debug, 'Retrieved telemetry ID:', parsed.aId);
            return parsed.aId;
        } catch (error) {
            log(debug, 'Error getting telemetry ID:', error);
            return null;
        }
    };

    const transferToLocalStorage = (storageKey = 'aId'): boolean => {
        try {
            const aId = getTelemetryId();
            if (!aId) {
                return false;
            }

            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(storageKey, aId);
                log(debug, 'Transferred telemetry ID to localStorage');
            }

            // Cleanup cookie after successful transfer
            cleanupCookie();
            return true;
        } catch (error) {
            log(debug, 'Error transferring to localStorage:', error);
            return false;
        }
    };

    const verifyWriteSuccess = (expectedAId: string): boolean => {
        try {
            const retrieved = getTelemetryId();
            return retrieved === expectedAId;
        } catch {
            return false;
        }
    };

    const cleanupCookie = (): void => {
        try {
            if (!domainInfo || typeof document === 'undefined') {
                return;
            }

            // Set expired cookie to remove it
            const expiredCookie = [
                `${finalConfig.cookieName}=`,
                'Max-Age=0',
                `Domain=.${domainInfo.rootDomain}`,
                'Path=/',
                'expires=Thu, 01 Jan 1970 00:00:00 GMT',
            ].join('; ');

            document.cookie = expiredCookie;
            log(debug, 'Cleaned up telemetry ID cookie');
        } catch (error) {
            log(debug, 'Error cleaning up cookie:', error);
        }
    };

    const isSupported = (): boolean => {
        try {
            return !!(
                domainInfo &&
                typeof document !== 'undefined' &&
                typeof btoa !== 'undefined' &&
                typeof atob !== 'undefined'
            );
        } catch {
            return false;
        }
    };

    const getDomainInfo = (): DomainInfo | null => {
        return domainInfo;
    };

    return {
        setTelemetryId,
        getTelemetryId,
        transferToLocalStorage,
        cleanupCookie,
        isSupported,
        getDomainInfo,
    };
};

// 1. Read the cookie
// 2. If the cookie is present, update the localStorage (cookie takes precedence)
// 3. If the cookie is not present, use the id from localStorage
// 4. If the localStorage is not present, aId will be null
// 5. Return the final aId. Cookie setting for the next hop is handled separately.
export const handleCrossDomainTelemetryId = (
    currentAIdFromLocalStorage?: string,
    config?: CrossDomainStorageConfig,
    debug = false,
): string | null => {
    // TODO: move to constants.ts after the other MR handling constants is merged
    const LOCAL_STORAGE_KEY = 'aId';

    try {
        const storage = createCrossDomainStorage(config, debug);

        if (!storage.isSupported()) {
            logWarn(debug, 'Cross-domain storage not supported.');
            return currentAIdFromLocalStorage || null;
        }

        const aIdFromIncomingCookie = storage.getTelemetryId();
        let finalAId: string | null = null;

        if (aIdFromIncomingCookie) {
            log(debug, `Cookie aId: ${aIdFromIncomingCookie}`);
            finalAId = aIdFromIncomingCookie;

            if (currentAIdFromLocalStorage !== aIdFromIncomingCookie) {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(LOCAL_STORAGE_KEY, finalAId);
                    log(debug, `Updated localStorage with cookie: ${finalAId}`);
                } else {
                    logWarn(
                        debug,
                        `localStorage not available, cannot update with cookie: ${finalAId}`,
                    );
                }
            }
            // Whether localStorage was updated or matched, the incoming cookie was processed and can be cleaned up
            storage.cleanupCookie();
            log(debug, `Cleaned processed incoming cookie.`);
        } else if (currentAIdFromLocalStorage) {
            log(debug, `Using local aId: ${currentAIdFromLocalStorage}`);
            finalAId = currentAIdFromLocalStorage;
        }

        return finalAId;
    } catch (error) {
        logError(debug, 'Error in handleCrossDomainTelemetryId:', error);
        return currentAIdFromLocalStorage || null;
    }
};

/**
 * Initializes cross-domain tracking by setting up a 'visibilitychange' event listener.
 * When the page becomes hidden, it saves the analytics ID from localStorage to a cookie.
 */
export const initCrossDomainTracking = (
    config?: CrossDomainStorageConfig,
    debug = false,
): (() => void) => {
    const LOCAL_STORAGE_KEY = 'aId';
    const storage = createCrossDomainStorage(config, debug);

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            try {
                if (!storage.isSupported()) {
                    return;
                }
                const aId =
                    typeof localStorage !== 'undefined'
                        ? localStorage.getItem(LOCAL_STORAGE_KEY)
                        : null;

                if (aId) {
                    storage.setTelemetryId(aId);
                    log(debug, `Set cross-domain cookie on visibility change.`);
                }
            } catch (error) {
                logError(
                    debug,
                    'Error setting cross-domain cookie on visibility change:',
                    error,
                );
            }
        }
    };

    if (
        typeof document !== 'undefined' &&
        'addEventListener' in document &&
        storage.isSupported()
    ) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        log(debug, 'Initialized cross-domain tracking on visibility change.');
    }

    // Return a cleanup function to remove the event listener
    return () => {
        if (
            typeof document !== 'undefined' &&
            'removeEventListener' in document
        ) {
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
        }
    };
};
