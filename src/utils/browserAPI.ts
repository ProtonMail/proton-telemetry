export const safeDocument = {
    get title(): string {
        try {
            return typeof document !== 'undefined' ? document.title || '' : '';
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting document title', e);
            return '';
        }
    },

    get referrer(): string {
        try {
            return typeof document !== 'undefined'
                ? document.referrer || ''
                : '';
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting document referrer', e);
            return '';
        }
    },

    get hidden(): boolean {
        try {
            return typeof document !== 'undefined'
                ? document.hidden || false
                : false;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting document hidden', e);
            return false;
        }
    },

    querySelectorAll: (selector: string): NodeListOf<Element> | [] => {
        try {
            return typeof document !== 'undefined'
                ? document.querySelectorAll(selector)
                : [];
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting document querySelectorAll', e);
            return [];
        }
    },

    addEventListener: (
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions,
    ): boolean => {
        try {
            if (typeof document !== 'undefined' && document.addEventListener) {
                document.addEventListener(type, listener, options);
                return true;
            }
            return false;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error adding document event listener', e);
            return false;
        }
    },

    removeEventListener: (
        type: string,
        listener: EventListener,
        options?: boolean | EventListenerOptions,
    ): boolean => {
        try {
            if (
                typeof document !== 'undefined' &&
                document.removeEventListener
            ) {
                document.removeEventListener(type, listener, options);
                return true;
            }
            return false;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error removing document event listener', e);
            return false;
        }
    },
};

export const safeWindow = {
    get location(): { href: string; pathname: string; search: string } {
        try {
            if (typeof window !== 'undefined' && window.location) {
                return {
                    href: window.location.href || '',
                    pathname: window.location.pathname || '',
                    search: window.location.search || '',
                };
            }
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting window location', e);
        }
        // Fallback
        return { href: '', pathname: '', search: '' };
    },

    get screen(): { width: number; height: number } {
        try {
            if (typeof window !== 'undefined' && window.screen) {
                return {
                    width: window.screen.width || 0,
                    height: window.screen.height || 0,
                };
            }
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting window screen', e);
        }
        // Fallback
        return { width: 0, height: 0 };
    },

    get devicePixelRatio(): number {
        try {
            return typeof window !== 'undefined'
                ? window.devicePixelRatio || 1
                : 1;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting window devicePixelRatio', e);
            // Fallback
            return 1;
        }
    },

    get doNotTrack(): string | null {
        try {
            return typeof window !== 'undefined'
                ? window.doNotTrack || null
                : null;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting window doNotTrack', e);
            return null;
        }
    },

    addEventListener: (
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions,
    ): boolean => {
        try {
            if (typeof window !== 'undefined' && window.addEventListener) {
                window.addEventListener(type, listener, options);
                return true;
            }
            return false;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error adding window event listener', e);
            return false;
        }
    },

    removeEventListener: (
        type: string,
        listener: EventListener,
        options?: boolean | EventListenerOptions,
    ): boolean => {
        try {
            if (typeof window !== 'undefined' && window.removeEventListener) {
                window.removeEventListener(type, listener, options);
                return true;
            }
            return false;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error removing window event listener', e);
            return false;
        }
    },
};

export const safeNavigator = {
    get doNotTrack(): string | null {
        try {
            return typeof navigator !== 'undefined'
                ? navigator.doNotTrack || null
                : null;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting navigator doNotTrack', e);
            return null;
        }
    },

    get globalPrivacyControl(): boolean | undefined {
        try {
            return typeof navigator !== 'undefined'
                ? navigator.globalPrivacyControl
                : undefined;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting navigator globalPrivacyControl', e);
            return undefined;
        }
    },

    get userAgent(): string {
        try {
            return typeof navigator !== 'undefined'
                ? navigator.userAgent || ''
                : '';
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting navigator userAgent', e);
            return '';
        }
    },

    get language(): string {
        try {
            return typeof navigator !== 'undefined' && navigator.language
                ? navigator.language
                : 'en';
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting navigator language', e);
            return 'en';
        }
    },

    get sendBeacon():
        | ((url: string | URL, data?: BodyInit | null) => boolean)
        | undefined {
        try {
            return typeof navigator !== 'undefined'
                ? navigator.sendBeacon?.bind(navigator)
                : undefined;
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting navigator sendBeacon', e);
            return undefined;
        }
    },
};

export const safePerformance = {
    now: (): number => {
        try {
            return typeof performance !== 'undefined' && performance.now
                ? performance.now()
                : Date.now();
        } catch (e) {
            // TODO 5991: replace with log helper once logging utils are added
            console.error('Error getting performance now', e);
            return Date.now();
        }
    },
};
