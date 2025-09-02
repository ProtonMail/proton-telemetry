// Cross-domain ID management using cookies for Proton domains
// Supports any subdomain under proton.me, protonvpn.com, and proton.black
import type { CrossDomainStorageConfig } from './types';
import { log, logError, logWarn } from './utils';

interface DomainInfo {
    rootDomain: string;
}

interface CrossDomainStorageInstance {
    setTelemetryId: (zId: string) => boolean;
    getTelemetryId: () => string | null;
    transferToLocalStorage: (storageKey?: string) => boolean;
    cleanupCookie: () => void;
    isSupported: () => boolean;
    getDomainInfo: () => DomainInfo | null;
}

// Supported root domains
const SUPPORTED_DOMAINS = ['proton.me', 'protonvpn.com', 'proton.black'];

const DEFAULT_CONFIG: Required<CrossDomainStorageConfig> = {
    cookieName: 'zId',
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
const createCookieValue = (zId: string): string => {
    const data = {
        zId,
        timestamp: Date.now(),
        version: 1,
    };
    return btoa(JSON.stringify(data));
};

// Parse encoded cookie value
const parseCookieValue = (
    cookieValue: string,
): { zId: string; timestamp: number } | null => {
    try {
        const decoded = atob(cookieValue);
        const data = JSON.parse(decoded);

        if (
            data &&
            typeof data.zId === 'string' &&
            typeof data.timestamp === 'number'
        ) {
            return { zId: data.zId, timestamp: data.timestamp };
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

    const setTelemetryId = (zId: string): boolean => {
        try {
            if (!domainInfo || !zId || typeof document === 'undefined') {
                log(
                    debug,
                    'Cannot set telemetry ID: missing domain info or zId',
                );
                return false;
            }

            const cookieValue = createCookieValue(zId);
            const cookieString = buildCookieString(
                cookieValue,
                finalConfig.cookieName,
                finalConfig.maxAge,
                domainInfo.rootDomain,
            );

            document.cookie = cookieString;
            log(debug, 'Set telemetry ID cookie:', cookieValue);

            return verifyWriteSuccess(zId);
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

            log(debug, 'Retrieved telemetry ID:', parsed.zId);
            return parsed.zId;
        } catch (error) {
            log(debug, 'Error getting telemetry ID:', error);
            return null;
        }
    };

    const transferToLocalStorage = (storageKey = 'zId'): boolean => {
        try {
            const zId = getTelemetryId();
            if (!zId) {
                return false;
            }

            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(storageKey, zId);
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

    const verifyWriteSuccess = (expectedZId: string): boolean => {
        try {
            const retrieved = getTelemetryId();
            return retrieved === expectedZId;
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
// 4. If the localStorage is not present, zId will be null
// 5. Return the final zId. Cookie setting for the next hop is handled separately.
export const handleCrossDomainTelemetryId = (
    currentZIdFromLocalStorage?: string,
    config?: CrossDomainStorageConfig,
    debug = false,
): string | null => {
    // TODO: move to constants.ts after the other MR handling constants is merged
    const LOCAL_STORAGE_KEY = 'zId';

    try {
        const storage = createCrossDomainStorage(config, debug);

        if (!storage.isSupported()) {
            logWarn(debug, 'Cross-domain storage not supported.');
            return currentZIdFromLocalStorage || null;
        }

        const zIdFromIncomingCookie = storage.getTelemetryId();
        let finalZId: string | null = null;

        if (zIdFromIncomingCookie) {
            log(debug, `Cookie zId: ${zIdFromIncomingCookie}`);
            finalZId = zIdFromIncomingCookie;

            if (currentZIdFromLocalStorage !== zIdFromIncomingCookie) {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(LOCAL_STORAGE_KEY, finalZId);
                    log(debug, `Updated localStorage with cookie: ${finalZId}`);
                } else {
                    logWarn(
                        debug,
                        `localStorage not available, cannot update with cookie: ${finalZId}`,
                    );
                }
            }
            // Whether localStorage was updated or matched, the incoming cookie was processed and can be cleaned up
            storage.cleanupCookie();
            log(debug, `Cleaned processed incoming cookie.`);
        } else if (currentZIdFromLocalStorage) {
            log(debug, `Using local zId: ${currentZIdFromLocalStorage}`);
            finalZId = currentZIdFromLocalStorage;
        }

        return finalZId;
    } catch (error) {
        logError(debug, 'Error in handleCrossDomainTelemetryId:', error);
        return currentZIdFromLocalStorage || null;
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
    const LOCAL_STORAGE_KEY = 'zId';
    const storage = createCrossDomainStorage(config, debug);

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            try {
                if (!storage.isSupported()) {
                    return;
                }
                const zId =
                    typeof localStorage !== 'undefined'
                        ? localStorage.getItem(LOCAL_STORAGE_KEY)
                        : null;

                if (zId) {
                    storage.setTelemetryId(zId);
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
