import { getPageType, getABTestFeatures, getElementText } from './utils';
export const createEventTracker = (sendData, pageLoadTime, config, shouldTrack) => {
    const state = {
        pageStartTime: performance.now(),
        activeStartTime: document.hidden ? null : performance.now(),
        totalActiveTime: 0,
        isPageVisible: !document.hidden,
    };
    function resetTimeTracking() {
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
        }
        else {
            state.activeStartTime = now;
        }
    }
    function handlePageExit() {
        if (!shouldTrack())
            return;
        const now = performance.now();
        const timeOnPage = now - state.pageStartTime;
        if (state.isPageVisible && state.activeStartTime !== null) {
            state.totalActiveTime += now - state.activeStartTime;
        }
        void sendData('exit', {
            timeOnPage: Math.round(timeOnPage),
            activeTime: Math.round(state.totalActiveTime),
        });
    }
    function trackClick(event) {
        const target = event.target;
        if (!target)
            return;
        // Ensure we have valid coordinates (some synthetic events don't have them)
        const xPos = typeof event.clientX === 'number' ? event.clientX : 0;
        const yPos = typeof event.clientY === 'number' ? event.clientY : 0;
        const clickData = {
            elementType: target.tagName.toLowerCase(),
            elementId: target.id || undefined,
            elementText: getElementText(target),
            elementHref: target.href || undefined,
            xPos,
            yPos,
        };
        void sendData('click', clickData);
    }
    function trackFormSubmit(event) {
        const form = event.target;
        if (!form)
            return;
        const formData = {
            formId: form.id || undefined,
            formAction: form.action || undefined,
            formFields: Array.from(form.elements)
                .map((el) => el.name)
                .filter(Boolean),
        };
        void sendData('form_submit', formData);
    }
    if (document.addEventListener) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handlePageExit);
        window.addEventListener('pagehide', handlePageExit);
    }
    resetTimeTracking();
    return {
        trackPageView: () => {
            if (!config.pageView)
                return;
            if (state.pageStartTime && state.totalActiveTime > 0) {
                handlePageExit();
            }
            resetTimeTracking();
            const pageViewData = {
                pageTitle: document.title,
                pageType: getPageType(window.location.pathname),
                path: window.location.pathname,
                referrer: document.referrer,
            };
            void sendData('page_view', pageViewData, {
                features: getABTestFeatures(),
            });
        },
        initClickTracking: () => {
            if (!config.click)
                return;
            document.addEventListener('click', trackClick);
        },
        initFormTracking: () => {
            if (!config.form)
                return;
            document.addEventListener('submit', trackFormSubmit);
        },
        trackModalView: (modalId, modalType) => {
            if (!config.modal)
                return;
            const modalData = {
                modalId,
                modalType,
                timeToShow: Math.round(performance.now() - pageLoadTime),
            };
            void sendData('modal_view', modalData);
        },
        destroy: () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handlePageExit);
            window.removeEventListener('pagehide', handlePageExit);
            if (config.click) {
                document.removeEventListener('click', trackClick);
            }
            if (config.form) {
                document.removeEventListener('submit', trackFormSubmit);
            }
        },
    };
};
