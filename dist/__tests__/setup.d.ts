declare class MockPerformanceObserver {
    private callback;
    constructor(callback: PerformanceObserverCallback);
    observe(): void;
    disconnect(): void;
    takeRecords(): never[];
}
