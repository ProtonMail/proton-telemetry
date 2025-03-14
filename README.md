# Proton Analytics

This repository contains a lightweight TypeScript library for frontend analytics tracking on the storefront, account, and lumo websites.

For the full documentation, including event schema, a code overview, and how to send custom events, see https://web.gitlab-pages.protontech.ch/corp/proton.me/analytics/overview/.

## Consuming the library

The CI builds and publishes the library to Nexus at https://nexus.protontech.ch/#browse/browse:web-npm (`analytics` package). To consume the library in your own repository, please do the following:

### In your .npmrc

⚠️ **SECURITY-CRITICAL STEP**: Proper registry configuration is critical to prevent dependency confusion attacks. Since we don't own the `@proton` scope on npm (we use `@protontech` publicly), you must ensure your `.npmrc` correctly points to our internal registry for all `@proton` packages.

Add the following to your `.npmrc` to safely access private repositories through the company VPN:

```
@proton:registry=https://nexus.protontech.ch/repository/web-npm/
//nexus.protontech.ch/repository/web-npm/
registry=https://registry.npmjs.org/
```

This configuration ensures that all `@proton` scoped packages are fetched from our internal Nexus repository, preventing potential supply chain attacks.

### Install the package

`pnpm add @proton/analytics`

### Integrate analytics in your project

Add this code somewhere where it will run on every webpage:

```ts
import { ProtonAnalytics } from '@proton/analytics'
...
// define endpoint as one of either https://telemetry.proton.me/payload or https://telemetry.protonvpn.com/payload
const analytics = ProtonAnalytics({
    endpoint,
    appVersion: 'web-static@3.14.1'
});

window.protonAnalytics = analytics;
```

Note that the endpoint should match the domain of the page where the script will run, so that the correct `Session-Id` can be passed to the backend.

## React hooks

This library is meant to be lightweight and framework-agnostic, but it exports a helper function that should make it easy to send custom events. In React, you should be able to implement a custom event hook this way:

```jsx
import { createCustomEventTracker } from '@proton/analytics';

export function useTrackCustomEvent(
    analytics: ReturnType<typeof createAnalytics>,
    eventType: string,
    properties?: CustomEventData,
    customData?: Record<string, unknown>
) {
    return () =>
        createCustomEventTracker(
            analytics,
            eventType,
            properties,
            customData
        )();
}
```

Now you should be able to create and track custom events with something like this:

```jsx
import { useTrackCustomEvent } from './hooks/useTrackCustomEvent';

function MyComponent({ analytics }) {
    const trackBasicEvent = useTrackCustomEvent(
        analytics,
        'clickme_button_clicked'
    );

    const trackDetailedEvent = useTrackCustomEvent(
        analytics,
        'form_submitted',
        { formId: 'contact-form' }, // properties
        { userType: 'premium' } // custom data
    );

    return (
        <div>
            <button onClick={trackBasicEvent}>Click me</button>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    trackDetailedEvent();
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

export const useTrackCustomEvent = (
    eventType: string,
    data?: CustomEventData
) => {
    useEffect(() => {
        window.protonAnalytics?.trackCustomEvent(eventType, {}, data);
    }, [eventType, data]);
};
```

which you can call with the custom event name followed by the arbitrary data you want to pass.

## Releasing

This package uses semantic versioning for releases. To create a new release:

1. Ensure you are on the main branch and your working directory is clean
2. Run one of the following commands depending on the type of release:
    - `pnpm run release:patch`
    - `pnpm run release:minor`
    - `pnpm run release:major`

This will:

1. Run linting and tests to ensure code quality
2. Build the package
3. Bump the version in package.json
4. Create a git tag
5. Push the changes and tag to the repository

The GitLab CI pipeline will automatically:

1. Build the package
2. Run tests
3. Publish to the Proton npm registry when a version tag is pushed
