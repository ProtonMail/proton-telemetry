import type {
    EventType,
    EventData,
    ClickEventData,
    PageViewEventData,
    FormEventData,
    ModalEventData,
    ExitEventData,
} from './types';
import { getPageType, getABTestFeatures, getElementText } from './utils';

export const createEventSender = (
    sendData: (
        eventType: EventType,
        eventData: EventData,
        customData?: Record<string, unknown>,
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
        pageStartTime: performance.now(),
        activeStartTime: document.hidden ? null : performance.now(),
        totalActiveTime: 0,
        isPageVisible: !document.hidden,
    };

    function resetTime() {
        state.pageStartTime = performance.now();
        state.activeStartTime = document.hidden ? null : state.pageStartTime;
        state.totalActiveTime = 0;
        state.isPageVisible = !document.hidden;
    }

    function handleVisibilityChange() {
        const now = performance.now();
        state.isPageVisible = !document.hidden;

        if (document.hidden) {
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

        const now = performance.now();
        const timeOnPage = now - state.pageStartTime;

        if (state.isPageVisible && state.activeStartTime !== null) {
            state.totalActiveTime += now - state.activeStartTime;
        }

        void sendData('exit', {
            timeOnPage: Math.round(timeOnPage),
            activeTime: Math.round(state.totalActiveTime),
        } as ExitEventData);
    }

    function sendClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target) return;

        // Ensure we have valid coordinates (some synthetic events don't have them)
        const xPos = typeof event.pageX === 'number' ? event.pageX : 0;
        const yPos = typeof event.pageY === 'number' ? event.pageY : 0;

        const clickData: ClickEventData = {
            elementType: target.tagName.toLowerCase(),
            elementId: target.id || undefined,
            elementText: getElementText(target),
            elementHref: (target as HTMLAnchorElement).href || undefined,
            xPos,
            yPos,
        };

        void sendData('click', clickData);
    }

    function sendFormSubmit(event: SubmitEvent) {
        const form = event.target as HTMLFormElement;
        if (!form) return;

        const formData: FormEventData = {
            formId: form.id || undefined,
            formAction: form.action || undefined,
            formFields: Array.from(form.elements)
                .map((el) => (el as HTMLInputElement).name)
                .filter(Boolean),
        };

        void sendData('form_submit', formData);
    }

    if (document.addEventListener) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handlePageExit);
        window.addEventListener('pagehide', handlePageExit);
    }

    resetTime();

    return {
        sendPageView: () => {
            if (!config.pageView) return;

            if (state.pageStartTime && state.totalActiveTime > 0) {
                handlePageExit();
            }

            resetTime();

            const pageViewData: PageViewEventData = {
                pageTitle: document.title,
                pageType: getPageType(window.location.pathname),
                path: window.location.pathname,
                referrer: document.referrer,
            };

            void sendData('page_view', pageViewData, {
                features: getABTestFeatures(),
            });
        },
        initClickSending: () => {
            if (!config.click) return;
            document.addEventListener('click', sendClick);
        },
        initFormSending: () => {
            if (!config.form) return;
            document.addEventListener('submit', sendFormSubmit);
        },
        sendModalView: (
            modalId: string,
            modalType: 'on_click' | 'exit_intent',
        ) => {
            if (!config.modal) return;
            const modalData: ModalEventData = {
                modalId,
                modalType,
                timeToShow: Math.round(performance.now() - pageLoadTime),
            };
            void sendData('modal_view', modalData);
        },
        destroy: () => {
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
            window.removeEventListener('beforeunload', handlePageExit);
            window.removeEventListener('pagehide', handlePageExit);
            if (config.click) {
                document.removeEventListener('click', sendClick);
            }
            if (config.form) {
                document.removeEventListener('submit', sendFormSubmit);
            }
        },
    };
};
