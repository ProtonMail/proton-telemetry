import type { AnalyticsConfig, CustomEventData, StandardEventType } from './types';
export declare const createAnalytics: (config: AnalyticsConfig) => {
    trackPageView: () => void;
    trackClicks: () => void;
    trackForms: () => void;
    trackModalView: (modalId: string, modalType: "on_click" | "exit_intent") => void;
    trackCustomEvent: (eventType: Exclude<string, StandardEventType>, properties: CustomEventData, customData: Record<string, unknown>) => void;
    destroy: () => Promise<void>;
};
