import { describe, it, expect } from "vitest";
import {
  createReconnectDelay,
  shouldScheduleReconnect,
  DUPLICATE_CONNECTION_REASON,
} from "../index.js";

// ---------------------------------------------------------------------------
// shouldScheduleReconnect — W7 / W8 / W10 / W23 / W24
// ---------------------------------------------------------------------------

const defaults = {
  manualDisconnect: false,
  duplicateConnectionReason: DUPLICATE_CONNECTION_REASON,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
};

describe("shouldScheduleReconnect", () => {
  it("returns true for a normal close that needs reconnect", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        closeCode: 1006,
        closeReason: "Abnormal Closure",
      }),
    ).toBe(true);
  });

  it("returns false when manualDisconnect is true", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        manualDisconnect: true,
        closeCode: 1006,
      }),
    ).toBe(false);
  });

  it("returns false for duplicate connection close", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        closeCode: 1000,
        closeReason: DUPLICATE_CONNECTION_REASON,
      }),
    ).toBe(false);
  });

  it("returns true for closeCode 1000 when it is not manual or duplicate", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        closeCode: 1000,
        closeReason: "",
      }),
    ).toBe(true);
  });

  it("returns false when reconnectAttempts reaches maxReconnectAttempts", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        reconnectAttempts: 5,
        maxReconnectAttempts: 5,
        closeCode: 1006,
      }),
    ).toBe(false);
  });

  it("returns true when reconnectAttempts is below maxReconnectAttempts", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        reconnectAttempts: 3,
        maxReconnectAttempts: 5,
        closeCode: 1006,
      }),
    ).toBe(true);
  });

  it("returns true when closeCode and closeReason are undefined", () => {
    expect(shouldScheduleReconnect({ ...defaults })).toBe(true);
  });

  it("returns false when manualDisconnect wins over attempts limit", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        manualDisconnect: true,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        closeCode: 1006,
      }),
    ).toBe(false);
  });

  it("returns false when duplicate reason wins over low attempts", () => {
    expect(
      shouldScheduleReconnect({
        ...defaults,
        closeReason: DUPLICATE_CONNECTION_REASON,
        closeCode: 4000,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createReconnectDelay — backward compat + edge cases (W10)
// ---------------------------------------------------------------------------

describe("createReconnectDelay (reconnect module)", () => {
  it("returns baseInterval * attempt for positive values", () => {
    expect(createReconnectDelay(1)).toBe(1000);
    expect(createReconnectDelay(2)).toBe(2000);
    expect(createReconnectDelay(3, 500)).toBe(1500);
  });

  it("treats attempt < 1 as 1", () => {
    expect(createReconnectDelay(0)).toBe(1000);
    expect(createReconnectDelay(-5)).toBe(1000);
    expect(createReconnectDelay(0, 500)).toBe(500);
  });

  it("treats negative baseInterval as 0", () => {
    expect(createReconnectDelay(1, -100)).toBe(0);
    expect(createReconnectDelay(3, -1)).toBe(0);
  });

  it("preserves default baseInterval of 1000", () => {
    expect(createReconnectDelay(1)).toBe(1000);
    expect(createReconnectDelay(4)).toBe(4000);
  });
});
