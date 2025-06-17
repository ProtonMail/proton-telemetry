# Proton Telemetry

This repository contains a lightweight TypeScript library for frontend telemetry on the storefront and account websites that respects users' DoNotTrack and GPC browser privacy settings. Please see the [Proton Privacy Policy](https://proton.me/legal/privacy) for more information.

## Consuming the library

To consume the library in your own repository, please do the following:

### Install the package

`npm i @protontech/telemetry`

### Integrate telemetry in your project

Add this code somewhere where it will run on every page load:

```ts
import { ProtonTelemetrySingleton } from '@protontech/telemetry'
...

ProtonTelemetrySingleton({
    endpoint, // one of either https://telemetry.proton.me/payload or https://telemetry.protonvpn.com/payload
    appVersion: 'web-static@<appVersion>', // e.g. 'web-static@3.14.1'
    debug: import.meta.env.DEV, // optional: enable debug logging in development
});
```

Note that the endpoint should match the domain of the page where the script will run, so that the correct `Session-Id` can be passed to the backend.

The singleton pattern ensures that telemetry is initialized once globally and can be accessed from anywhere in your application without needing to pass the instance around.

## React hooks

This library is meant to be lightweight and framework-agnostic, but it exports a helper function that should make it easy to send custom events. In React, you can implement a custom event hook and helper function this way:

```jsx
import { useEffect } from 'react';
import { sendCustomEvent } from '@protontech/telemetry';

type CustomEventData = Record<string, unknown>;

export const useTrackCustomEvent = (eventType: string, data?: CustomEventData) => {
    useEffect(() => {
        sendCustomEvent(eventType, data || {});
    }, [eventType, data]);
};

export const trackCustomEvent = (eventType: string, data?: CustomEventData) => {
    sendCustomEvent(eventType, data || {});
};
```

Now you should be able to create and send custom events with something like this:

```jsx
import { useSendCustomEvent } from './hooks/useSendCustomEvent';

function MyComponent() {
    const sendBasicEvent = useSendCustomEvent('clickme_button_clicked');

    const sendDetailedEvent = useSendCustomEvent(
        'form_submitted',
        { formId: 'contact-form' }, // custom properties
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
