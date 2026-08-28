import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventSender } from '../eventSender.ts';
import type { ClickEventData } from '../types/index.ts';

type SendData = Parameters<typeof createEventSender>[0];

const config = {
    pageView: false,
    click: true,
    form: false,
    performance: false,
    modal: false,
    exit: false,
};

describe('createEventSender Click events', () => {
    const senders: Array<ReturnType<typeof createEventSender>> = [];

    afterEach(() => {
        senders.forEach((sender) => sender.destroy());
        senders.length = 0;
        document.body.replaceChildren();
        document
            .querySelectorAll('meta[name^="ab-test:"]')
            .forEach((element) => element.remove());
    });

    function initClickSender(
        click = true,
        shouldSend: () => boolean = () => true,
    ) {
        const sendData = vi.fn<SendData>();
        sendData.mockResolvedValue(true);
        const sender = createEventSender(
            sendData,
            0,
            { ...config, click },
            shouldSend,
        );
        senders.push(sender);
        sender.initClickSending();
        return sendData;
    }

    function click(target: Element) {
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    it('reports the actionable link for a nested SVG path', () => {
        const sendData = initClickSender();
        const link = document.createElement('a');
        link.href = '/pricing#plans';
        link.id = 'pricing-fallback';
        link.dataset.analyticsId = 'pricing-primary';
        link.setAttribute('aria-label', 'View pricing');
        link.innerHTML = '<span><svg><path /></svg></span>';
        document.body.append(link);

        click(link.querySelector('path')!);

        expect(sendData).toHaveBeenCalledTimes(1);
        const clickData = sendData.mock.calls[0]![1] as ClickEventData;
        expect(clickData).toMatchObject({
            elementType: 'a',
            elementId: 'pricing-primary',
            elementText: 'View pricing',
            elementHref: link.href,
        });
        expect(sendData.mock.calls[0]![3]).toBe('high');
    });

    it('falls back to the resolved element DOM id', () => {
        const sendData = initClickSender();
        const button = document.createElement('button');
        button.id = 'fallback-id';
        button.innerHTML = '<span>Open modal</span>';
        document.body.append(button);

        click(button.querySelector('span')!);

        const clickData = sendData.mock.calls[0]![1] as ClickEventData;
        expect(clickData.elementId).toBe('fallback-id');
        expect(clickData.elementType).toBe('button');
        expect(clickData.elementText).toBe('Open modal');
    });

    it('ignores clicks outside supported elements', () => {
        const sendData = initClickSender();
        const paragraph = document.createElement('p');
        paragraph.textContent = 'Lorem ipsum';
        document.body.append(paragraph);

        click(paragraph);

        expect(sendData).not.toHaveBeenCalled();
    });

    it.each(['input', 'textarea', 'select'] as const)(
        'ignores a tracked %s wrapped by a tracked ancestor',
        (tagName) => {
            const sendData = initClickSender();
            const wrapper = document.createElement('div');
            wrapper.dataset.analyticsId = 'tracked-wrapper';
            const control = document.createElement(tagName);
            control.setAttribute('data-analytics-id', 'tracked-control');
            wrapper.append(control);
            document.body.append(wrapper);

            click(control);

            expect(sendData).not.toHaveBeenCalled();
        },
    );

    it('does not listen when automatic click events are disabled', () => {
        const sendData = initClickSender(false);
        const button = document.createElement('button');
        document.body.append(button);

        click(button);

        expect(sendData).not.toHaveBeenCalled();
    });

    it('attaches current A/B-test features', () => {
        const feature = document.createElement('meta');
        feature.name = 'ab-test:pricing';
        feature.content = 'variant-a';
        document.head.append(feature);

        const sendData = initClickSender();
        const button = document.createElement('button');
        document.body.append(button);

        click(button);

        expect(sendData.mock.calls[0]![2]).toEqual({
            features: { pricing: 'variant-a' },
        });
    });
});
