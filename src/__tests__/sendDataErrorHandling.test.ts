import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import { BATCH_DELAY } from '../constants';
import {
    createFetchMock,
    createConsoleMocks,
    setupBasicTelemetryTest,
    setupTimers,
    cleanupMocks,
} from './helpers';
import { createBasicTelemetryConfig } from './helpers/fixtures';

describe('ProtonTelemetry - sendData Error Handling (No Retry)', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let consoleSpyLog: ReturnType<typeof vi.spyOn>;
    let consoleSpyError: ReturnType<typeof vi.spyOn>;
    let cleanupTimers: () => void;

    beforeEach(() => {
        cleanupTimers = setupTimers();
        setupBasicTelemetryTest();

        mockFetch = createFetchMock();
        const consoleMocks = createConsoleMocks();
        consoleSpyLog = consoleMocks.consoleSpyLog;
        consoleSpyError = consoleMocks.consoleSpyError;
    });

    afterEach(() => {
        cleanupTimers();
        cleanupMocks();
        consoleSpyLog.mockRestore();
        consoleSpyError.mockRestore();
    });

    it('does not retry on network error and drops events', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        mockFetch.mockRejectedValue(new Error('Network error'));

        telemetry.sendCustomEvent('test_event', { test: true });

        // Initial attempt after batch delay
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        expect(consoleSpyError).toHaveBeenCalledWith(
            '[Telemetry]',
            'Network error occurred. Dropping events.',
            expect.any(Error),
        );

        // Advance time significantly past any potential retry delay
        await vi.advanceTimersByTimeAsync(10_000);

        // Verify fetch was only called once (no retries)
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Send another event to see if the queue was cleared
        mockFetch.mockResolvedValueOnce({ ok: true });
        telemetry.sendCustomEvent('test_event_2', { test: true });
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const secondCall = mockFetch.mock.lastCall;
        const secondBody = JSON.parse(secondCall![1].body);
        expect(secondBody.events).toHaveLength(1);
        expect(secondBody.events[0].eventType).toBe('test_event_2');
    });

    it('does not retry on 429/503 if Retry-After header is missing', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers(), // No Retry-After
            })
            .mockResolvedValueOnce({ ok: true }); // Potential next call

        telemetry.sendCustomEvent('test_event', { test: true });

        // Initial attempt
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        expect(consoleSpyError).toHaveBeenCalledWith(
            '[Telemetry]',
            'Server responded with status 429 without a valid Retry-After header. Dropping events.',
        );

        // Advance time beyond any potential retry interval and verify no retry
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on other non-OK server responses (e.g., 500)', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 500, // Internal Server Error
                headers: new Headers({ 'retry-after': '5' }), // Header should be ignored
            })
            .mockResolvedValueOnce({ ok: true }); // Potential next call

        telemetry.sendCustomEvent('test_event', { test: true });

        // Initial attempt
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        expect(consoleSpyError).toHaveBeenCalledWith(
            '[Telemetry]',
            'Server responded with status 500 without a valid Retry-After header. Dropping events.',
        );

        // Advance time beyond any potential retry interval and verify no retry
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});
