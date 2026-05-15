import { describe, it, expect } from "vitest";
import {
  createExponentialRetryDelay,
  createNextRetryAt,
  shouldStopRetry,
} from "../retry-policy.js";

const opts = { baseDelayMs: 1000, maxDelayMs: 60000 };

describe("createExponentialRetryDelay", () => {
  it("retryCount=0 returns baseDelayMs", () => {
    expect(createExponentialRetryDelay(0, opts)).toBe(1000);
  });

  it("retryCount=1 doubles the delay", () => {
    expect(createExponentialRetryDelay(1, opts)).toBe(2000);
  });

  it("grows exponentially", () => {
    expect(createExponentialRetryDelay(2, opts)).toBe(4000);
    expect(createExponentialRetryDelay(3, opts)).toBe(8000);
    expect(createExponentialRetryDelay(4, opts)).toBe(16000);
  });

  it("caps at maxDelayMs", () => {
    expect(createExponentialRetryDelay(10, opts)).toBe(60000);
    expect(createExponentialRetryDelay(100, opts)).toBe(60000);
  });

  it("negative retryCount is normalized to 0", () => {
    expect(createExponentialRetryDelay(-1, opts)).toBe(1000);
    expect(createExponentialRetryDelay(-5, opts)).toBe(1000);
  });

  it("fractional retryCount is floored", () => {
    expect(createExponentialRetryDelay(1.9, opts)).toBe(2000);
  });
});

describe("createNextRetryAt", () => {
  it("returns nowMs + delay", () => {
    expect(createNextRetryAt(0, 100000, opts)).toBe(101000);
    expect(createNextRetryAt(1, 100000, opts)).toBe(102000);
  });

  it("caps delay at maxDelayMs", () => {
    expect(createNextRetryAt(100, 100000, opts)).toBe(160000);
  });

  it("negative retryCount normalized", () => {
    expect(createNextRetryAt(-3, 50000, opts)).toBe(51000);
  });
});

describe("shouldStopRetry", () => {
  it("returns false when retryCount < maxRetryCount", () => {
    expect(shouldStopRetry(0, 5)).toBe(false);
    expect(shouldStopRetry(4, 5)).toBe(false);
  });

  it("returns true when retryCount >= maxRetryCount", () => {
    expect(shouldStopRetry(5, 5)).toBe(true);
    expect(shouldStopRetry(10, 5)).toBe(true);
  });

  it("negative retryCount is normalized to 0", () => {
    expect(shouldStopRetry(-1, 5)).toBe(false);
  });
});
