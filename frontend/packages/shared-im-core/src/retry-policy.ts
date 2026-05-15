export interface RetryPolicyOptions {
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Compute exponential backoff delay for a given retry attempt.
 * retryCount=0 returns baseDelayMs. Delay is capped at maxDelayMs.
 * Negative retryCount is treated as 0.
 */
export function createExponentialRetryDelay(
  retryCount: number,
  options: RetryPolicyOptions,
): number {
  const count = Math.max(0, Math.floor(retryCount));
  const raw = options.baseDelayMs * Math.pow(2, count);
  return Math.min(options.maxDelayMs, raw);
}

/**
 * Compute the absolute timestamp (ms) when the next retry should occur.
 * Negative retryCount is treated as 0.
 */
export function createNextRetryAt(
  retryCount: number,
  nowMs: number,
  options: RetryPolicyOptions,
): number {
  return nowMs + createExponentialRetryDelay(retryCount, options);
}

/**
 * Determine whether the retry limit has been reached.
 * Returns true when retryCount >= maxRetryCount.
 */
export function shouldStopRetry(
  retryCount: number,
  maxRetryCount: number,
): boolean {
  return Math.max(0, Math.floor(retryCount)) >= maxRetryCount;
}
