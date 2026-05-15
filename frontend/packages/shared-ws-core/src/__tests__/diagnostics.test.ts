import { describe, it, expect } from "vitest";
import {
  resolveWebSocketConnectionStatus,
  createWebSocketDiagnosticsSnapshot,
} from "../diagnostics.js";
import type { WebSocketConnectionStatus } from "../diagnostics.js";

describe("resolveWebSocketConnectionStatus", () => {
  it("returns connecting when connecting is true", () => {
    expect(resolveWebSocketConnectionStatus({ connected: false, connecting: true })).toBe<WebSocketConnectionStatus>("connecting");
  });

  it("returns connected when connected is true", () => {
    expect(resolveWebSocketConnectionStatus({ connected: true, connecting: false })).toBe<WebSocketConnectionStatus>("connected");
  });

  it("returns disconnected when both are false", () => {
    expect(resolveWebSocketConnectionStatus({ connected: false, connecting: false })).toBe<WebSocketConnectionStatus>("disconnected");
  });

  it("connecting takes precedence over connected", () => {
    expect(resolveWebSocketConnectionStatus({ connected: true, connecting: true })).toBe<WebSocketConnectionStatus>("connecting");
  });
});

describe("createWebSocketDiagnosticsSnapshot", () => {
  it("produces snapshot with derived status", () => {
    const snapshot = createWebSocketDiagnosticsSnapshot({
      connected: true,
      connecting: false,
      reconnectAttempts: 3,
      lastEventAt: 1700000000000,
    });
    expect(snapshot).toEqual({
      status: "connected",
      reconnectAttempts: 3,
      lastEventAt: 1700000000000,
    });
  });

  it("reflects connecting state in snapshot", () => {
    const snapshot = createWebSocketDiagnosticsSnapshot({
      connected: false,
      connecting: true,
      reconnectAttempts: 0,
      lastEventAt: 0,
    });
    expect(snapshot.status).toBe<WebSocketConnectionStatus>("connecting");
    expect(snapshot.reconnectAttempts).toBe(0);
  });

  it("reflects disconnected state with reconnect attempts", () => {
    const snapshot = createWebSocketDiagnosticsSnapshot({
      connected: false,
      connecting: false,
      reconnectAttempts: 5,
      lastEventAt: 1700000000000,
    });
    expect(snapshot.status).toBe<WebSocketConnectionStatus>("disconnected");
    expect(snapshot.reconnectAttempts).toBe(5);
  });
});
