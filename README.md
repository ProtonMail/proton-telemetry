# Proton Telemetry

This repository contains a lightweight, privacy-friendly TypeScript library for frontend telemetry on the storefront and account websites. Please see the [Proton Privacy Policy](https://proton.me/legal/privacy) for more information.

For the full documentation including event schema and code overview, see https://web.gitlab-pages.protontech.ch/corp/proton.me/telemetry/overview/.

## Consuming the library

To consume the library in your own repository, please do the following:

### Install the package

`npm install @protontech/telemetry`

### Integrate telemetry in your project

Add this code somewhere where it will run on every page load:

```ts
import { ProtonTelemetry } from '@proton/telemetry'
...

const telemetry = ProtonTelemetry({
    endpoint, // one of either https://telemetry.proton.me/payload or https://telemetry.protonvpn.com/payload
    appVersion: 'web-static@<appVersion>', // e.g. 'web-static@3.14.1'
    uid: '' // optional
});

window.protonTelemetry = telemetry;
```

Note that the endpoint should match the domain of the page where the script will run, so that the correct `Session-Id` can be passed to the backend.

## React hooks

This library is meant to be lightweight and framework-agnostic, but it exports a helper function that should make it easy to send custom events. In React, you should be able to implement a custom event hook this way:

```jsx
import { createCustomEventSender } from '@proton/telemetry';

export function useSendCustomEvent(
    telemetry: ReturnType<typeof createTelemetry>,
    eventType: string,
    properties?: CustomEventData,
    customData?: Record<string, unknown>
) {
    return () =>
        createCustomEventSender(telemetry, eventType, properties, customData)();
}
```

Now you should be able to create and send custom events with something like this:

```jsx
import { useSendCustomEvent } from './hooks/useSendCustomEvent';

function MyComponent({ telemetry }) {
    const sendBasicEvent = useSendCustomEvent(
        telemetry,
        'clickme_button_clicked'
    );

    const sendDetailedEvent = useSendCustomEvent(
        telemetry,
        'form_submitted',
        { formId: 'contact-form' } // custom properties
    );

    return (
        <div>
            <button onClick={sendBasicEvent}>Click me</button>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    sendDetailedEvent();
                }}
            >
                {/* form fields */}
            </form>
        </div>
    );
}
```

or if you prefer something simpler:

```jsx
import { useEffect } from 'react';

type CustomEventData = Record<string, unknown>;

export const useSendCustomEvent = (
    eventType: string,
    data?: CustomEventData
) => {
    useEffect(() => {
        window.protonTelemetry?.sendCustomEvent(eventType, {}, data);
    }, [eventType, data]);
};
```

which you can call with the custom event name followed by the arbitrary data you want to pass.
