// Cross-domain ID management using cookies for proton.me and protonvpn.com
// Supports proton.me/account.proton.me/lumo.proton.me and protonvpn.com/account.protonvpn.com
interface CrossDomainStorageConfig {
    cookieName?: string;
    maxAge?: number;
    debug?: boolean;
}

interface DomainInfo {
    rootDomain: string;
    subdomains: string[];
}

interface CrossDomainStorageInstance {
    setTelemetryId: (aId: string) => boolean;
    getTelemetryId: () => string | null;
    transferToLocalStorage: (storageKey?: string) => boolean;
    cleanupCookie: () => void;
    isSupported: () => boolean;
    getDomainInfo: () => DomainInfo | null;
}

const DOMAIN_CONFIGS: Record<string, DomainInfo> = {
    'proton.me': {
        rootDomain: 'proton.me',
        subdomains: ['account.proton.me', 'lumo.proton.me'],
    },
    'protonvpn.com': {
        rootDomain: 'protonvpn.com',
        subdomains: ['account.protonvpn.com'],
    },
    // Scientist environments
    'proton.black': {
        rootDomain: 'proton.black',
        subdomains: [], // Will be populated dynamically
    },
};

const DEFAULT_CONFIG: Required<CrossDomainStorageConfig> = {
    cookieName: 'aId',
    maxAge: 300, // 5 minutes
    debug: false,
};

// Generate list of potential scientist subdomains based on current hostname
const getScientistSubdomains = (hostname: string): string[] => {
    const subdomains: string[] = [];

    // Extract scientist name from hostname
    let scientistName = '';

    if (
        hostname.startsWith('protonvpn-com.') &&
        hostname.endsWith('.proton.black')
    ) {
        // Format: protonvpn-com.<scientist>.proton.black
        scientistName = hostname
            .replace('protonvpn-com.', '')
            .replace('.proton.black', '');
    } else if (
        hostname.endsWith('.proton.black') &&
        hostname !== 'proton.black'
    ) {
        // Format: <scientist>.proton.black or <subdomain>.<scientist>.proton.black
        const parts = hostname.replace('.proton.black', '').split('.');
        scientistName = parts.at(-1) ?? '';
    }

    if (scientistName) {
        // Generate all possible subdomain combinations for this scientist
        subdomains.push(
            // Proton.me style environments
            `${scientistName}.proton.black`,
            `account.${scientistName}.proton.black`,
            `lumo.${scientistName}.proton.black`,
            // ProtonVPN.com style environments
            `protonvpn-com.${scientistName}.proton.black`,
            `account.protonvpn-com.${scientistName}.proton.black`,
        );
    }

    return subdomains;
};

// Detect current domain configuration
const detectDomainInfo = (): DomainInfo | null => {
    try {
        if (typeof window === 'undefined' || !window.location) {
            return null;
        }

        const hostname = window.location.hostname.toLowerCase();

        // Check for scientist environments first (*.proton.black)
        if (hostname.endsWith('.proton.black') || hostname === 'proton.black') {
            return {
                rootDomain: 'proton.black',
                subdomains: getScientistSubdomains(hostname),
            };
        }

        // Check for exact matches in production environments
        for (const [domain, info] of Object.entries(DOMAIN_CONFIGS)) {
            if (domain === 'proton.black') continue; // already handled above

            if (hostname === domain || hostname === `www.${domain}`) {
                return info;
            }

            // Check subdomains
            if (info.subdomains.some((subdomain) => hostname === subdomain)) {
                return info;
            }

            // Check if hostname ends with the root domain
            if (hostname.endsWith(`.${domain}`)) {
                return info;
            }
        }

        return null;
    } catch {
        return null;
    }
};

// Logging utility
export const safeLog = (debug: boolean, ...args: unknown[]): void => {
    try {
        if (debug && typeof console !== 'undefined' && console.log) {
            console.log('[CrossDomainStorage]', ...args);
        }
    } catch {
        // Silently fail
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
): CrossDomainStorageInstance => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const domainInfo = detectDomainInfo();

    const setTelemetryId = (aId: string): boolean => {
        try {
            if (!domainInfo || !aId || typeof document === 'undefined') {
                safeLog(
                    finalConfig.debug,
                    'Cannot set analytics ID: missing domain info or aId',
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
            safeLog(finalConfig.debug, 'Set telemetry ID cookie:', cookieValue);

            return verifyWriteSuccess(aId);
        } catch (error) {
            safeLog(finalConfig.debug, 'Error setting telemetry ID:', error);
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

            safeLog(finalConfig.debug, 'Retrieved telemetry ID:', parsed.aId);
            return parsed.aId;
        } catch (error) {
            safeLog(finalConfig.debug, 'Error getting telemetry ID:', error);
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
                safeLog(
                    finalConfig.debug,
                    'Transferred telemetry ID to localStorage',
                );
            }

            // Cleanup cookie after successful transfer
            cleanupCookie();
            return true;
        } catch (error) {
            safeLog(
                finalConfig.debug,
                'Error transferring to localStorage:',
                error,
            );
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
            safeLog(finalConfig.debug, 'Cleaned up telemetry ID cookie');
        } catch (error) {
            safeLog(finalConfig.debug, 'Error cleaning up cookie:', error);
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
): string | null => {
    try {
        const storage = createCrossDomainStorage(config);

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
        // Silently fail and return current aId or null
        return currentAId || null;
    }
};
