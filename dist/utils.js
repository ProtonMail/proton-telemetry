export const generateMessageId = () => {
    return crypto.randomUUID();
};
export const getAppVersion = () => {
    const versionApp = process.env.VERSION?.match(/^[vV](\d+)\.(\d+)\.(\d+)\+(.*)$/);
    const app = versionApp ? `web-static-${versionApp[4].replace('-', '')}` : 'web-static';
    const version = versionApp ? `${versionApp[1]}.${versionApp[2]}.${versionApp[3]}` : '0.0.0';
    return `${app}@${version}`;
};
export const fetchWithHeaders = async (input, init) => {
    const prevPage = document?.referrer ? { 'X-PM-Referer': document.referrer } : {};
    const existingHeaders = init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : init?.headers || {};
    return fetch(input, {
        ...init,
        credentials: 'include',
        headers: {
            ...existingHeaders,
            ...prevPage,
            'Content-Type': 'application/json;charset=utf-8',
            Accept: 'application/vnd.protonmail.v1+json',
            'x-pm-appversion': getAppVersion(),
        },
    });
};
// Useful for tracking scroll events
export const throttle = (func, limit) => {
    let inThrottle = false;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
};
export const getPageType = (path) => {
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
export const getFormattedUTCTimezone = () => {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
    return `UTC${sign}${hours}:${minutes}`;
};
export const getABTestFeatures = () => {
    const features = {};
    const metaTags = document.querySelectorAll('meta[name^="ab-test:"]');
    metaTags.forEach((tag) => {
        const name = tag.getAttribute('name');
        const content = tag.getAttribute('content');
        if (name && content) {
            const testName = name.replace('ab-test:', '');
            features[testName] = content;
        }
    });
    return features;
};
// Try to parse meaningful text from an element, or use attributes if available (for use with click events)
export const getElementText = (element) => {
    if (!element)
        return undefined;
    // Try semantic attributes first
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel)
        return truncateText(ariaLabel);
    const title = element.getAttribute('title');
    if (title)
        return truncateText(title);
    const alt = element.getAttribute('alt');
    if (alt)
        return truncateText(alt);
    const name = element.getAttribute('name');
    if (name)
        return truncateText(name);
    if ((element instanceof HTMLInputElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLSelectElement) &&
        element.value) {
        return truncateText(element.value);
    }
    // Get element's parent heading if it's a nearby sibling or ancestor
    const heading = getClosestHeading(element);
    if (heading && heading.textContent) {
        return truncateText(heading.textContent.trim());
    }
    // Try data attribute
    const dataText = element.getAttribute('data-text');
    if (dataText)
        return truncateText(dataText);
    // For links or buttons without text, try to find something descriptive
    if (element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button') {
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
        if (text.includes('(function') ||
            text.includes('window.localStorage') ||
            text.includes('document.currentScript') ||
            text.includes('addEventListener(') ||
            (text.includes('{') && text.includes('}') && text.includes(';'))) {
            // Try to get initial text before script content, otherwise return the element tag name
            const firstPart = text.split(/\(function|\{|\)|;/)[0].trim();
            return truncateText(firstPart || element.tagName.toLowerCase() + ' element with JS code');
        }
    }
    return truncateText(text);
};
// Helper function to truncate text to 100 characters, to avoid sending large payloads
const truncateText = (text) => {
    return text ? text.substring(0, 100) : undefined;
};
// Helper to find the closest heading that might describe this element
function getClosestHeading(element) {
    // Check siblings first
    let sibling = element.previousElementSibling;
    while (sibling) {
        if (/^h[1-6]$/i.test(sibling.tagName)) {
            return sibling;
        }
        sibling = sibling.previousElementSibling;
    }
    // Check parent's heading children
    const parent = element.parentElement;
    if (parent) {
        const heading = parent.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
            return heading;
        }
    }
    return null;
}
