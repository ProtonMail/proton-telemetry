import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getTelemetryInstance,
    ProtonTelemetrySingleton,
    destroyTelemetryInstance,
    getExistingTelemetryInstance,
} from '../singleton';
import type { TelemetryConfig } from '../types';

// Mock the telemetry creation to avoid actual telemetry calls in tests
vi.mock('../telemetry', () => ({
    createTelemetry: vi.fn(() => ({
        sendPageView: vi.fn(),
        sendClicks: vi.fn(),
        sendForms: vi.fn(),
        sendModalView: vi.fn(),
        sendCustomEvent: vi.fn(),
        destroy: vi.fn().mockResolvedValue(undefined),
    })),
}));

describe('Telemetry Singleton', () => {
    const baseConfig: TelemetryConfig = {
        endpoint: 'http://telemetry.proton.me/telemetry',
        appVersion: '1.0.0',
        debug: false,
        dryRun: false,
        uidHeader: 'X-User-ID',
        events: {
            pageView: true,
            click: true,
            form: true,
        },
    };

    beforeEach(async () => {
        await destroyTelemetryInstance();
    });

    it('should return the same instance for multiple calls', () => {
        const instance1 = getTelemetryInstance(baseConfig);
        const instance2 = getTelemetryInstance(baseConfig);

        expect(instance1).toBe(instance2);
    });

    it('should return the same instance using convenience function', () => {
        const instance1 = ProtonTelemetrySingleton(baseConfig);
        const instance2 = getTelemetryInstance(baseConfig);

        expect(instance1).toBe(instance2);
    });

    it('should warn when trying to initialize with different config', () => {
        const consoleSpy = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => {});

        const config1 = { ...baseConfig, debug: false };
        const config2 = { ...baseConfig, debug: true };

        const instance1 = getTelemetryInstance(config1);
        const instance2 = getTelemetryInstance(config2);

        expect(instance1).toBe(instance2);
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                '[Telemetry] Singleton already initialized with different config',
            ),
        );

        consoleSpy.mockRestore();
    });

    it('should return null when no instance exists', () => {
        const instance = getExistingTelemetryInstance();
        expect(instance).toBeNull();
    });

    it('should return existing instance', () => {
        const created = getTelemetryInstance(baseConfig);
        const existing = getExistingTelemetryInstance();

        expect(existing).toBe(created);
    });

    it('should clean up singleton when destroyed', async () => {
        const instance = getTelemetryInstance(baseConfig);
        expect(getExistingTelemetryInstance()).toBe(instance);

        await instance.destroy();
        expect(getExistingTelemetryInstance()).toBeNull();
    });

    it('should handle destroyTelemetryInstance when no instance exists', async () => {
        // Should not throw
        await expect(destroyTelemetryInstance()).resolves.toBeUndefined();
    });

    it('should destroy existing instance via destroyTelemetryInstance', async () => {
        const instance = getTelemetryInstance(baseConfig);
        expect(getExistingTelemetryInstance()).toBe(instance);

        await destroyTelemetryInstance();
        expect(getExistingTelemetryInstance()).toBeNull();
    });

    it('should allow creating new instance after destruction', () => {
        const instance1 = getTelemetryInstance(baseConfig);

        return instance1.destroy().then(() => {
            const instance2 = getTelemetryInstance(baseConfig);
            expect(instance2).not.toBe(instance1);
            expect(getExistingTelemetryInstance()).toBe(instance2);
        });
    });
});
