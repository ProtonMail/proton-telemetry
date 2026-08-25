import { describe, expect, it } from 'vitest';
import { getElementText } from '../utils/helpers.ts';

describe('getElementText', () => {
    it('prefers an aria-label', () => {
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Open pricing');
        button.textContent = 'Ignored visible label';

        expect(getElementText(button)).toBe('Open pricing');
    });

    it('uses visible button text without reading its value', () => {
        const button = document.createElement('button');
        button.value = 'some-form-value';
        button.textContent = 'Open pricing';

        expect(getElementText(button)).toBe('Open pricing');
    });

    it.each(['input', 'textarea', 'select'] as const)(
        'does not read the value of a %s',
        (tagName) => {
            const control = document.createElement(tagName);

            if (control instanceof HTMLSelectElement) {
                const option = document.createElement('option');
                option.value = 'private-form-value';
                option.textContent = 'Visible option';
                option.selected = true;
                control.add(option);
                control.value = 'private-form-value';
            } else {
                control.value = 'private-form-value';
            }

            expect(getElementText(control)).not.toBe('private-form-value');
        },
    );
});
