// Cross-domain ID management using cookies for Proton domains
// Supports any subdomain under proton.me, protonvpn.com, and proton.black
import type { CrossDomainStorageConfig } from './types';
import { log } from './utils';

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
    maxAge: 3600 * 24, // 24 hours
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

// Utility function to handle ID across domains
export const handleCrossDomainTelemetryId = (
    currentAId?: string,
    config?: CrossDomainStorageConfig,
    debug = false,
): string | null => {
    try {
        const storage = createCrossDomainStorage(config, debug);

        if (!storage.isSupported()) {
            return currentAId || null;
        }

        // If we have a current aId, set it in the cookie for cross-domain access
        if (currentAId) {
            storage.setTelemetryId(currentAId);
            return currentAId;
        }

        // Try to get aId from cross-domain cookie
        const crossDomainAId = storage.getTelemetryId();
        if (crossDomainAId) {
            // Transfer to localStorage and cleanup cookie
            storage.transferToLocalStorage();
            return crossDomainAId;
        }

        return null;
    } catch {
        // Fail silently and return current aId or null
        return currentAId || null;
    }
};
