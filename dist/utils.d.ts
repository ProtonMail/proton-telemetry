import type { PageType } from './types';
export declare const generateMessageId: () => string;
export declare const getAppVersion: () => string;
export declare const fetchWithHeaders: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export declare const throttle: <T extends (...args: Parameters<T>) => ReturnType<T>>(func: T, limit: number) => ((...args: Parameters<T>) => void);
export declare const getPageType: (path: string) => PageType;
export declare const getFormattedUTCTimezone: () => string;
export declare const getABTestFeatures: () => Record<string, string>;
export declare const getElementText: (element: HTMLElement) => string | undefined;
