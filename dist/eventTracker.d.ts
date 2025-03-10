import type { EventType, EventData } from './types';
export declare const createEventTracker: (sendData: (eventType: EventType, eventData: EventData, customData?: Record<string, unknown>) => Promise<boolean>, pageLoadTime: number, config: {
    pageView: boolean;
    click: boolean;
    form: boolean;
    performance: boolean;
    visibility: boolean;
    modal: boolean;
}, shouldTrack: () => boolean) => {
    trackPageView: () => void;
    initClickTracking: () => void;
    initFormTracking: () => void;
    trackModalView: (modalId: string, modalType: "on_click" | "exit_intent") => void;
    destroy: () => void;
};
