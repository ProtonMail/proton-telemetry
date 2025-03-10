import type { EventType, EventData } from './types';
export declare function createPerformanceTracker(sendData: (eventType: EventType, eventData: EventData) => Promise<boolean>): {
    initializeObserver: () => void;
};
