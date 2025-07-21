// Session storage keys for telemetry configuration
const PT_CONFIG_KEY = '__pt_config__';
const LEGACY_PAGE_TITLE_KEY = '__pa_page_title_override__';

// Type for the consolidated configuration object
interface ProtonTelemetryConfig {
    pageTitle?: string;
    telemetryEnabled?: boolean;
}

// In-memory fallback for when sessionStorage is not available
let inMemoryConfig: ProtonTelemetryConfig = {};
let sessionStorageAvailable: boolean | null = null;

// Test if sessionStorage is available
function isSessionStorageAvailable(): boolean {
    if (sessionStorageAvailable !== null) {
        return sessionStorageAvailable;
    }

    try {
        const testKey = '__proton_telemetry_test__';
        sessionStorage.setItem(testKey, testKey);
        sessionStorage.removeItem(testKey);
        sessionStorageAvailable = true;
        return true;
    } catch {
        console.warn(
            '[Telemetry] sessionStorage not available, using in-memory fallback for telemetry config',
        );
        sessionStorageAvailable = false;
        return false;
    }
}

// Get configuration from storage (sessionStorage or in-memory fallback)
function getConfig(): ProtonTelemetryConfig {
    if (!isSessionStorageAvailable()) {
        return { ...inMemoryConfig };
    }

    try {
        const configStr = sessionStorage.getItem(PT_CONFIG_KEY);
        if (!configStr) {
            // Migrate legacy page title setting if it exists
            const legacyPageTitle = sessionStorage.getItem(
                LEGACY_PAGE_TITLE_KEY,
            );
            if (legacyPageTitle) {
                const config = { pageTitle: legacyPageTitle };
                sessionStorage.setItem(PT_CONFIG_KEY, JSON.stringify(config));
                sessionStorage.removeItem(LEGACY_PAGE_TITLE_KEY);
                return config;
            }
            return {};
        }

        return JSON.parse(configStr) as ProtonTelemetryConfig;
    } catch (error) {
        console.warn(
            '[Telemetry] Error reading telemetry config from sessionStorage:',
            error,
        );
        return {};
    }
}

// Set configuration in storage (sessionStorage or in-memory fallback)
function setConfig(updates: Partial<ProtonTelemetryConfig>): void {
    const currentConfig = getConfig();
    const newConfig = { ...currentConfig, ...updates };

    if (!isSessionStorageAvailable()) {
        inMemoryConfig = newConfig;
        return;
    }

    try {
        sessionStorage.setItem(PT_CONFIG_KEY, JSON.stringify(newConfig));
    } catch (error) {
        console.warn(
            '[Telemetry] Error writing telemetry config to sessionStorage, using in-memory fallback:',
            error,
        );
        sessionStorageAvailable = false;
        inMemoryConfig = newConfig;
    }
}

// Page title override functions
export function setPageTitleOverride(title: string): void {
    setConfig({ pageTitle: title });
}

export function getPageTitleOverride(): string | null {
    const config = getConfig();
    return config.pageTitle ?? null;
}

export function clearPageTitleOverride(): void {
    const config = getConfig();
    if (config.pageTitle !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pageTitle, ...rest } = config;
        if (!isSessionStorageAvailable()) {
            inMemoryConfig = rest;
            return;
        }

        try {
            if (Object.keys(rest).length === 0) {
                sessionStorage.removeItem(PT_CONFIG_KEY);
            } else {
                sessionStorage.setItem(PT_CONFIG_KEY, JSON.stringify(rest));
            }
        } catch (error) {
            console.warn(
                '[Telemetry] Error updating config in sessionStorage:',
                error,
            );
            sessionStorageAvailable = false;
            inMemoryConfig = rest;
        }
    }
}

// Telemetry enabled functions
export function setTelemetryEnabled(enabled: boolean): void {
    setConfig({ telemetryEnabled: enabled });
}

export function getTelemetryEnabled(): boolean | null {
    const config = getConfig();
    return config.telemetryEnabled ?? null;
}
