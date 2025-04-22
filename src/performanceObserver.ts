import type { EventType, EventData, PerformanceEventData } from './types';

export function createPerformanceObserver(
    sendData: (eventType: EventType, eventData: EventData) => Promise<boolean>,
) {
    return {
        initializeObserver: () => {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.entryType === 'navigation') {
                        const navEntry = entry as PerformanceNavigationTiming;
                        const performanceData: PerformanceEventData = {
                            pageLoadTime: Math.round(
                                navEntry.loadEventEnd - navEntry.startTime,
                            ),
                            dnsTime: Math.round(
                                navEntry.domainLookupEnd -
                                    navEntry.domainLookupStart,
                            ),
                            tcpTime: Math.round(
                                navEntry.connectEnd - navEntry.connectStart,
                            ),
                            ttfb: Math.round(
                                navEntry.responseStart - navEntry.requestStart,
                            ),
                        };
                        void sendData('performance', performanceData);
                    }
                });
            });

            observer.observe({ entryTypes: ['navigation'] });
        },
    };
}
