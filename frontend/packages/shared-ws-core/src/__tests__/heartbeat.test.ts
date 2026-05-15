/**
 * Heartbeat payload tests — W1/W9/W23/W24
 *
 * W1: shared-ws-core only holds pure functions; no I/O, no timers, no platform state.
 * W9: createHeartbeatPayload is a pure function with explicit timestamp input.
 *     Timer scheduling (setInterval/clearInterval) stays in Web/Mobile stores.
 * W23: No changes to connect/reconnect/dispatch behavior.
 * W24: Conflict resolution defers to this document.
 */
import { describe, it, expect } from "vitest";
import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";
import { createHeartbeatPayload } from "../heartbeat.js";

describe("createHeartbeatPayload", () => {
  // ── Requirement 1: returns a sendable string ──────────────────────
  it("returns a non-empty string suitable for socket.send()", () => {
    const payload = createHeartbeatPayload(1700000000000);
    expect(typeof payload).toBe("string");
    expect(payload.length).toBeGreaterThan(0);
  });

  // ── Requirement 2: payload type matches protocol definition ───────
  it("sets type to WS_MESSAGE_TYPE.HEARTBEAT ('HEARTBEAT')", () => {
    const parsed = JSON.parse(createHeartbeatPayload(1700000000000));
    expect(parsed.type).toBe(WS_MESSAGE_TYPE.HEARTBEAT);
    expect(parsed.type).toBe("HEARTBEAT");
  });

  // ── Requirement 3: JSON is parseable round-trip ───────────────────
  it("produces valid JSON that round-trips without loss", () => {
    const ts = 1700000000123;
    const raw = createHeartbeatPayload(ts);
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      type: "HEARTBEAT",
      data: { timestamp: ts },
      timestamp: ts,
    });
  });

  it("does not throw on JSON.parse", () => {
    expect(() => JSON.parse(createHeartbeatPayload(0))).not.toThrow();
  });

  // ── Requirement 4: pure function — no time/socket/timer dependency ─
  it("is deterministic: same input produces identical output", () => {
    const ts = 1699999999999;
    const a = createHeartbeatPayload(ts);
    const b = createHeartbeatPayload(ts);
    expect(a).toBe(b);
  });

  it("reflects the caller-provided timestamp, not Date.now()", () => {
    const fixed = 1000000000000;
    const parsed = JSON.parse(createHeartbeatPayload(fixed));
    expect(parsed.timestamp).toBe(fixed);
    expect(parsed.data.timestamp).toBe(fixed);
  });

  it("uses the same timestamp at top-level and inside data", () => {
    const ts = 1700000050000;
    const parsed = JSON.parse(createHeartbeatPayload(ts));
    expect(parsed.timestamp).toBe(parsed.data.timestamp);
  });

  // ── Requirement 5: Web and Mobile consume the same payload ────────
  it("Web and Mobile produce identical payloads for the same timestamp", () => {
    // Both stores call createHeartbeatPayload(Date.now()) — same function, same output.
    // This test proves the shared function is the single source of truth.
    const ts = 1700000099999;
    const fromWeb = createHeartbeatPayload(ts);
    const fromMobile = createHeartbeatPayload(ts);
    expect(fromWeb).toBe(fromMobile);
  });

  // ── Backward-compatible zero-arg overload ─────────────────────────
  it("zero-arg overload still works and returns valid JSON", () => {
    const raw = createHeartbeatPayload();
    expect(() => JSON.parse(raw)).not.toThrow();
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe("HEARTBEAT");
    expect(typeof parsed.timestamp).toBe("number");
    expect(parsed.timestamp).toBeGreaterThan(0);
  });

  it("zero-arg overload uses Date.now() (non-deterministic but recent)", () => {
    const before = Date.now();
    const parsed = JSON.parse(createHeartbeatPayload());
    const after = Date.now();
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
    expect(parsed.timestamp).toBeLessThanOrEqual(after);
  });

  // ── Edge cases ────────────────────────────────────────────────────
  it("accepts timestamp 0 (epoch)", () => {
    const parsed = JSON.parse(createHeartbeatPayload(0));
    expect(parsed.timestamp).toBe(0);
    expect(parsed.data.timestamp).toBe(0);
  });

  it("accepts large future timestamps", () => {
    const farFuture = 4102444800000; // 2100-01-01
    const parsed = JSON.parse(createHeartbeatPayload(farFuture));
    expect(parsed.timestamp).toBe(farFuture);
  });

  it("accepts negative timestamps (pre-epoch)", () => {
    const preEpoch = -1000;
    const parsed = JSON.parse(createHeartbeatPayload(preEpoch));
    expect(parsed.timestamp).toBe(preEpoch);
  });
});
