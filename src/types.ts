export interface TelemetryConfig {
    endpoint: string;
    appVersion: string;
    debug?: boolean;
    dryRun?: boolean;
    uidHeader?: string;
    events?: {
        pageView?: boolean;
        click?: boolean;
        form?: boolean;
        performance?: boolean;
        visibility?: boolean;
        modal?: boolean;
    };
}

export interface Campaign {
    name: string;
    source: string;
    medium: string;
    term: string;
    content: string;
}

export interface Library {
    name: string;
    version: string;
}

export interface Page {
    title: string;
    url: string;
    path: string;
    referrer: string;
    queryString: string;
    queryParams: Record<string, string>;
}

export interface Referrer {
    type: string;
    name: string;
    url: string;
}

export interface Screen {
    width: number;
    height: number;
    density: number;
}

export type ABTestFeatures = Record<string, string>;

export type StandardEventType =
    | 'page_view'
    | 'click'
    | 'form_submit'
    | 'performance'
    | 'exit'
    | 'modal_view'
    | 'random_uid_created';

export type CustomEventType = string;

export type EventType = StandardEventType | CustomEventType;

export type BaseEventData = {
    pageTitle?: string;
    pageType?: string;
    path?: string;
};

export type PageViewEventData = BaseEventData & {
    referrer?: string;
};

export type ClickEventData = BaseEventData & {
    elementType: string;
    elementId?: string;
    elementText?: string;
    elementHref?: string;
    xPos: number;
    yPos: number;
};

export type PerformanceEventData = BaseEventData & {
    pageLoadTime: number;
    dnsTime: number;
    tcpTime: number;
    ttfb: number;
};

export type ExitEventData = BaseEventData & {
    timeOnPage: number;
    activeTime: number;
};

export type ModalEventData = BaseEventData & {
    modalId: string;
    modalType: 'on_click' | 'exit_intent';
    timeToShow: number;
};

export type CustomEventData = BaseEventData & {
    [key: string]: unknown;
};

export type EventData =
    | PageViewEventData
    | ClickEventData
    | PerformanceEventData
    | ExitEventData
    | ModalEventData
    | CustomEventData;

export interface EventContext {
    campaign: Campaign;
    library: Library;
    browserLocale: string;
    page: Page;
    referrer: Referrer;
    screen: Screen;
    timezone: string;
    userAgent: string;
    features: ABTestFeatures;
}

export interface EventProperties {
    pageTitle?: string;
    pageType?: string;
    path?: string;
    pageLoadTime?: number;
    dnsTime?: number;
    tcpTime?: number;
    ttfb?: number;
    timeOnPage?: number;
    activeTime?: number;
    elementType?: string;
    elementId?: string;
    elementText?: string;
    elementHref?: string;
    xPos?: number;
    yPos?: number;
    data?: Record<string, unknown>;
}

export interface TelemetryEvent {
    aId: string;
    messageId: string;
    clientEventTimestampUtc: string;
    clientEventTimestampLocal: string;
    eventType: EventType;
    context: EventContext;
    properties: EventData;
}

export interface NavigatorUAData {
    platform: string;
}

export type PageType =
    | 'landing_page'
    | 'support_kb'
    | 'blog'
    | 'legal'
    | 'pricing'
    | 'download'
    | 'other';

export interface BatchedTelemetryEvents {
    events: TelemetryEvent[];
}

export type EventPriority = 'high' | 'low';

export interface QueuedEvent {
    event: TelemetryEvent;
    priority: EventPriority;
}
