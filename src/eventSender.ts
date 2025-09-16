import type {
    EventType,
    EventData,
    ClickEventData,
    PageViewEventData,
    ModalEventData,
    ExitEventData,
} from './types';
import {
    getPageType,
    getABTestFeatures,
    safeDocument,
    safeWindow,
    safePerformance,
} from './utils';

export const createEventSender = (
    sendData: (
        eventType: EventType,
        eventData?: EventData,
        customData?: Record<string, unknown>,
        priority?: 'high' | 'low',
    ) => Promise<boolean>,
    pageLoadTime: number,
    config: {
        pageView: boolean;
        click: boolean;
        form: boolean;
        performance: boolean;
        visibility: boolean;
        modal: boolean;
    },
    shouldSend: () => boolean,
) => {
    const state = {
        pageStartTime: safePerformance.now(),
        activeStartTime: safeDocument.hidden ? null : safePerformance.now(),
        totalActiveTime: 0,
        isPageVisible: !safeDocument.hidden,
    };

    function resetTime() {
        state.pageStartTime = safePerformance.now();
        state.activeStartTime = safeDocument.hidden
            ? null
            : state.pageStartTime;
        state.totalActiveTime = 0;
        state.isPageVisible = !safeDocument.hidden;
    }

    function handleVisibilityChange() {
        const now = safePerformance.now();
        state.isPageVisible = !safeDocument.hidden;

        if (safeDocument.hidden) {
            if (state.activeStartTime !== null) {
                state.totalActiveTime += now - state.activeStartTime;
                state.activeStartTime = null;
            }
        } else {
            state.activeStartTime = now;
        }
    }

    function handlePageExit() {
        if (!shouldSend()) return;

        const now = safePerformance.now();
        const timeOnPage = now - state.pageStartTime;

        if (state.isPageVisible && state.activeStartTime !== null) {
            state.totalActiveTime += now - state.activeStartTime;
        }

        void sendData('exit', {
            timeOnPage: Math.round(timeOnPage),
            activeTime: Math.round(state.totalActiveTime),
        } as ExitEventData);
    }

    function sendClick(event: Event) {
        if (!shouldSend()) return;

        const target = event.target as HTMLElement;
        if (!target) return;

        const mouseEvent = event as MouseEvent;
        const xPos =
            typeof mouseEvent.pageX === 'number' ? mouseEvent.pageX : 0;
        const yPos =
            typeof mouseEvent.pageY === 'number' ? mouseEvent.pageY : 0;

        const clickData: ClickEventData = {
            elementType: target.tagName.toLowerCase(),
            elementId: target.id || undefined,
            elementHref: (target as HTMLAnchorElement).href || undefined,
            xPos,
            yPos,
        };

        void sendData('click', clickData);
    }

    function sendFormSubmit(event: Event) {
        if (!shouldSend()) return;

        const form = event.target as HTMLFormElement;
        if (!form) return;

        void sendData('form_submit');
    }

    const hasDocumentListeners = safeDocument.addEventListener(
        'visibilitychange',
        handleVisibilityChange,
    );
    const hasWindowListeners =
        safeWindow.addEventListener('beforeunload', handlePageExit) &&
        safeWindow.addEventListener('pagehide', handlePageExit);

    resetTime();

    return {
        sendPageView: () => {
            if (!config.pageView) return;
            if (!shouldSend()) return;

            if (state.pageStartTime && state.totalActiveTime > 0) {
                handlePageExit();
            }

            resetTime();

            const location = safeWindow.location;

            const pageViewData: PageViewEventData = {
                pageTitle: safeDocument.title,
                pageType: getPageType(location.pathname),
                path: location.pathname,
                referrer: safeDocument.referrer,
            };

            void sendData(
                'page_view',
                pageViewData,
                {
                    features: getABTestFeatures(),
                } as Record<string, unknown>,
                'high',
            );
        },
        initClickSending: () => {
            if (!config.click) return;
            safeDocument.addEventListener('click', sendClick);
        },
        initFormSending: () => {
            if (!config.form) return;
            safeDocument.addEventListener('submit', sendFormSubmit);
        },
        sendModalView: (
            modalId: string,
            modalType: 'on_click' | 'exit_intent',
        ) => {
            if (!config.modal) return;
            if (!shouldSend()) return;

            void sendData('modal_view', {
                modalId,
                modalType,
            } as ModalEventData);
        },
        destroy: () => {
            if (hasDocumentListeners) {
                safeDocument.removeEventListener(
                    'visibilitychange',
                    handleVisibilityChange,
                );
            }
            if (hasWindowListeners) {
                safeWindow.removeEventListener('beforeunload', handlePageExit);
                safeWindow.removeEventListener('pagehide', handlePageExit);
            }
            if (config.click) {
                safeDocument.removeEventListener('click', sendClick);
            }
            if (config.form) {
                safeDocument.removeEventListener('submit', sendFormSubmit);
            }
        },
    };
};
