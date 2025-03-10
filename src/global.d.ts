declare global {
    interface Window {
        doNotTrack?: string | null;
    }

    interface Navigator {
        doNotTrack?: string | null;
        globalPrivacyControl?: boolean;
    }
}

export {};
