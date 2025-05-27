import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTelemetry as ProtonTelemetry } from '../telemetry';
import { BATCH_DELAY, MAX_RETRIES } from '../constants';
import {
    createFetchMock,
    createConsoleMocks,
    setupBasicTelemetryTest,
    setupTimers,
    cleanupMocks,
} from './helpers';
import { createBasicTelemetryConfig } from './helpers/fixtures';

// Tests focusing on the retry mechanism triggered by sendData
describe('ProtonTelemetry - Retry Logic', () => {
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

    it('retries on 429/503 with Retry-After header', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        const retryAfterSeconds = 2;
        const retryAfterMs = retryAfterSeconds * 1000;

        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers({
                    'retry-after': String(retryAfterSeconds),
                }),
            })
            .mockResolvedValueOnce({ ok: true });

        telemetry.sendCustomEvent('test_event', { test: true });

        // Initial attempt after batch delay
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Check console log for retry message
        expect(consoleSpyLog).toHaveBeenCalledWith(
            '[Telemetry]',
            `Server responded with 429. Retrying after ${retryAfterMs}ms (attempt #1) based on Retry-After header.`,
        );

        // Should not retry before Retry-After delay and retry right after
        await vi.advanceTimersByTimeAsync(retryAfterMs - 1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Verify the event data integrity on the successful retry
        const lastCall = mockFetch.mock.lastCall;
        expect(lastCall).toBeDefined();
        const body = JSON.parse(lastCall![1].body);
        expect(body.events).toHaveLength(1);
        expect(body.events[0].eventType).toBe('test_event');
    });

    it('drops events after max retries on 429/503 with Retry-After', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        const retryAfterSeconds = 1;
        const retryAfterMs = retryAfterSeconds * 1000;

        // Mock fetch to consistently return 429 with Retry-After
        mockFetch.mockResolvedValue({
            ok: false,
            status: 429,
            headers: new Headers({
                'retry-after': String(retryAfterSeconds),
            }),
        });

        telemetry.sendCustomEvent('test_event', { test: true });

        // Initial attempt
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Retries
        let expectedCalls = 1;
        for (let i = 0; i < MAX_RETRIES; i++) {
            expect(mockFetch).toHaveBeenCalledTimes(expectedCalls);
            expect(consoleSpyLog).toHaveBeenCalledWith(
                '[Telemetry]',
                `Server responded with 429. Retrying after ${retryAfterMs}ms (attempt #${
                    i + 1
                }) based on Retry-After header.`,
            );
            await vi.advanceTimersByTimeAsync(retryAfterMs);
            expectedCalls++;
            expect(mockFetch).toHaveBeenCalledTimes(expectedCalls);
        }

        // The last attempt failed, reaching max retries
        expect(mockFetch).toHaveBeenCalledTimes(MAX_RETRIES + 1);
        expect(consoleSpyError).toHaveBeenCalledWith(
            '[Telemetry]',
            `Max retries (${MAX_RETRIES}) reached after 429 response. Dropping events.`,
        );

        // Verify no more retries happen
        await vi.advanceTimersByTimeAsync(retryAfterMs * 2);
        expect(mockFetch).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    });

    it('resets retry count after successful request following retries', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        const retryAfterSeconds1 = 1;
        const retryAfterMs1 = retryAfterSeconds1 * 1000;
        const retryAfterSeconds2 = 2;
        const retryAfterMs2 = retryAfterSeconds2 * 1000;

        mockFetch
            // Event 1: Fail (429), Fail (429), Succeed
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers({
                    'retry-after': String(retryAfterSeconds1),
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers({
                    'retry-after': String(retryAfterSeconds2),
                }),
            })
            .mockResolvedValueOnce({ ok: true })
            // Event 2: Fail (429), Succeed
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers({
                    'retry-after': String(retryAfterSeconds1),
                }),
            })
            .mockResolvedValueOnce({ ok: true });

        // Event 1
        telemetry.sendCustomEvent('test_event_1', { test: true });

        // Initial attempt (fails)
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(consoleSpyLog).toHaveBeenCalledWith(
            '[Telemetry]',
            `Server responded with 429. Retrying after ${retryAfterMs1}ms (attempt #1) based on Retry-After header.`,
        );

        // First retry (fails)
        await vi.advanceTimersByTimeAsync(retryAfterMs1);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(consoleSpyLog).toHaveBeenCalledWith(
            '[Telemetry]',
            `Server responded with 429. Retrying after ${retryAfterMs2}ms (attempt #2) based on Retry-After header.`,
        );

        // Second retry (succeeds)
        await vi.advanceTimersByTimeAsync(retryAfterMs2);
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(consoleSpyLog).toHaveBeenCalledWith(
            '[Telemetry]',
            'Batch sent successfully after retries.',
        );

        // Send second event to see if retry count was reset
        telemetry.sendCustomEvent('test_event_2', { test: true });

        // Initial attempt for event 2 (fails) - uses BATCH_DELAY
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(4);
        // Check that retry count was reset (attempt #1)
        expect(consoleSpyLog).toHaveBeenCalledWith(
            '[Telemetry]',
            `Server responded with 429. Retrying after ${retryAfterMs1}ms (attempt #1) based on Retry-After header.`,
        );

        // First retry for event 2 (succeeds)
        await vi.advanceTimersByTimeAsync(retryAfterMs1);
        expect(mockFetch).toHaveBeenCalledTimes(5);
        expect(consoleSpyLog).toHaveBeenCalledWith(
            '[Telemetry]',
            'Batch sent successfully after retries.',
        );

        // Verify overall calls and last event data
        expect(mockFetch).toHaveBeenCalledTimes(5);
        const lastCall = mockFetch.mock.calls[4];
        const body = JSON.parse(lastCall![1].body);
        expect(body.events[0].eventType).toBe('test_event_2');
    });

    it('does not duplicate events on retry (429 with Retry-After)', async () => {
        const telemetry = ProtonTelemetry(createBasicTelemetryConfig());

        const retryAfterSeconds = 1;
        const retryAfterMs = retryAfterSeconds * 1000;

        // Mock fetch to fail twice with 429+RetryAfter, then succeed
        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers({
                    'retry-after': String(retryAfterSeconds),
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Headers({
                    'retry-after': String(retryAfterSeconds),
                }),
            })
            .mockResolvedValueOnce({ ok: true });

        telemetry.sendCustomEvent('test_event', { test: true });

        // Initial attempt
        await vi.advanceTimersByTimeAsync(BATCH_DELAY);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const firstCall = mockFetch.mock.lastCall;
        expect(firstCall).toBeDefined();
        const firstBody = JSON.parse(firstCall![1].body);
        expect(firstBody.events).toHaveLength(1);
        expect(firstBody.events[0].eventType).toBe('test_event');

        // First retry
        await vi.advanceTimersByTimeAsync(retryAfterMs);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const secondCall = mockFetch.mock.lastCall;
        expect(secondCall).toBeDefined();
        const secondBody = JSON.parse(secondCall![1].body);
        expect(secondBody.events).toHaveLength(1);
        expect(secondBody.events[0].eventType).toBe('test_event');

        // Second retry (Success)
        await vi.advanceTimersByTimeAsync(retryAfterMs);
        expect(mockFetch).toHaveBeenCalledTimes(3);
        const thirdCall = mockFetch.mock.lastCall;
        expect(thirdCall).toBeDefined();
        const thirdBody = JSON.parse(thirdCall![1].body);
        expect(thirdBody.events).toHaveLength(1);
        expect(thirdBody.events[0].eventType).toBe('test_event');

        // Verify data integrity (messageId should be the same across retries)
        expect(firstBody.events[0].messageId).toBe(
            secondBody.events[0].messageId,
        );
        expect(secondBody.events[0].messageId).toBe(
            thirdBody.events[0].messageId,
        );
    });
});
