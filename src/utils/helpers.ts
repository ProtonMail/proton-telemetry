import type { PageType } from '../types';
import { safeDocument } from './browserAPI';

export const generateMessageId = (): string => {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID();
    }
    // Fallback for environments where crypto.randomUUID is not available
    // Generates a UUID v4-like string. In the string 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
    // - x is replaced with a random number 0-15
    // - y is replaced with a random number 8-11
    // - the result is converted to a hexadecimal string
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        // random number 0-15, truncated to integer
        const r = (Math.random() * 16) | 0;
        // replace 'x' in the string above with a random number 0-15 and 'y' with random number 8-11
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        // convert to hex string
        return v.toString(16);
    });
};

export const fetchWithHeaders = async (
    input: RequestInfo | URL,
    appVersion: string,
    uid?: string,
    init?: RequestInit,
): Promise<Response> => {
    const referrer = safeDocument.referrer;
    const prevPage: HeadersInit = referrer ? { 'X-PM-Referer': referrer } : {};
    const uidHeader: HeadersInit = uid ? { 'x-pm-uid': uid } : {};
    const existingHeaders =
        init?.headers instanceof Headers
            ? Object.fromEntries(
                  (init.headers as unknown as Map<string, string>).entries(),
              )
            : (init?.headers as HeadersInit) || {};

    // The url comes from developer-controlled configuration (config.endpoint), not from direct user input
    // semgrep-ignore-line [gitlab.nodejs_scan.javascript-ssrf-rule-node_ssrf]
    return fetch(input, {
        ...init,
        credentials: 'include',
        headers: {
            ...existingHeaders,
            ...prevPage,
            ...uidHeader,
            'Content-Type': 'application/json;charset=utf-8',
            Accept: 'application/vnd.protonmail.v1+json',
            'x-pm-appversion': appVersion,
        },
    });
};

// Useful for scroll events
export const throttle = <T extends (...args: Parameters<T>) => ReturnType<T>>(
    func: T,
    limit: number,
): ((...args: Parameters<T>) => void) => {
    let inThrottle = false;

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
};

export const getPageType = (path: string): PageType => {
    if (path.includes('/support')) {
        return 'support_kb';
    }

    if (path.includes('/blog')) {
        return 'blog';
    }

    if (path.includes('/legal/')) {
        return 'legal';
    }

    if (path.includes('/pricing')) {
        return 'pricing';
    }

    if (path.includes('/download')) {
        return 'download';
    }

    if (path.includes('/l/')) {
        return 'landing_page';
    }

    return 'other';
};

export const getFormattedUTCTimezone = (): string => {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const minutes = String(Math.abs(offset) % 60).padStart(2, '0');

    return `UTC${sign}${hours}:${minutes}`;
};

export const getABTestFeatures = (): Record<string, string> => {
    const features: Record<string, string> = {};

    const metaTags = safeDocument.querySelectorAll('meta[name^="ab-test:"]');
    if (metaTags && typeof metaTags.forEach === 'function') {
        metaTags.forEach((tag) => {
            const name = tag.getAttribute('name');
            const content = tag.getAttribute('content');

            if (name && content) {
                const testName = name.replace('ab-test:', '');
                features[testName] = content;
            }
        });
    }

    return features;
};

// Try to parse meaningful text from an element, or use attributes if available (for use with click events)
export const getElementText = (element: HTMLElement): string | undefined => {
    if (!element) return undefined;

    // Try semantic attributes first
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return truncateText(ariaLabel);

    const title = element.getAttribute('title');
    if (title) return truncateText(title);

    const alt = element.getAttribute('alt');
    if (alt) return truncateText(alt);

    const name = element.getAttribute('name');
    if (name) return truncateText(name);

    if (
        (element instanceof HTMLInputElement ||
            element instanceof HTMLButtonElement ||
            element instanceof HTMLSelectElement) &&
        element.value
    ) {
        return truncateText(element.value);
    }

    // Get element's parent heading if it's a nearby sibling or ancestor
    const heading = getClosestHeading(element);
    if (heading && heading.textContent) {
        return truncateText(heading.textContent.trim());
    }

    // Try data attribute
    const dataText = element.getAttribute('data-text');
    if (dataText) return truncateText(dataText);

    // For links or buttons without text, try to find something descriptive
    if (
        element.tagName.toLowerCase() === 'a' ||
        element.tagName.toLowerCase() === 'button'
    ) {
        const img = element.querySelector('img');
        if (img?.alt) {
            return truncateText(img.alt);
        }
    }

    // Get direct text nodes only, to avoid script content
    let text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(' ')
        .trim();

    // Use textContent, but check if it contains any JS. If so, return the element tag name.
    if (!text) {
        text = element.textContent?.trim() || '';
        if (
            text.includes('(function') ||
            text.includes('window.localStorage') ||
            text.includes('document.currentScript') ||
            text.includes('addEventListener(') ||
            (text.includes('{') && text.includes('}') && text.includes(';'))
        ) {
            // Try to get initial text before script content, otherwise return the element tag name
            const firstPart = text.split(/\(function|\{|\}|;/)[0].trim();
            return truncateText(
                firstPart ||
                    element.tagName.toLowerCase() + ' element with JS code',
            );
        }
    }

    return truncateText(text);
};

// Helper function to truncate text to 100 characters, to avoid sending large payloads
const truncateText = (text: string | undefined): string | undefined => {
    return text ? text.substring(0, 100) : undefined;
};

// Helper to find the closest heading that might describe this element
function getClosestHeading(element: HTMLElement): HTMLElement | null {
    // Check siblings first
    let sibling = element.previousElementSibling;
    while (sibling) {
        if (/^h[1-6]$/i.test(sibling.tagName)) {
            return sibling as HTMLElement;
        }
        sibling = sibling.previousElementSibling;
    }

    // Check parent's heading children
    const parent = element.parentElement;
    if (parent) {
        const heading = parent.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
            return heading as HTMLElement;
        }
    }

    return null;
}

// Logging utilities
export const log = (debug: boolean, ...args: unknown[]): void => {
    try {
        if (debug && typeof console !== 'undefined' && console.log) {
            console.log('[Telemetry]', ...args);
        }
    } catch {
        // Fail silently
    }
};

export const logWarn = (debug: boolean, ...args: unknown[]): void => {
    try {
        if (debug && typeof console !== 'undefined' && console.warn) {
            console.warn('[Telemetry]', ...args);
        }
    } catch {
        // Fail silently
    }
};

export const logError = (debug: boolean, ...args: unknown[]): void => {
    try {
        if (debug && typeof console !== 'undefined' && console.error) {
            console.error('[Telemetry]', ...args);
        }
    } catch {
        // Fail silently
    }
};
