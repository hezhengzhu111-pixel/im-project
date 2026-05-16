/**
 * E2EE negotiation 事件回归测试
 *
 * 覆盖场景 (E2, E10, E11, E28, E31, E32, E33):
 * 1. request action emit event
 * 2. accepted action emit event
 * 3. rejected action emit event
 * 4. disabled action emit event
 * 5. snake_case payload 字段可解析
 * 6. camelCase payload 字段可解析
 * 7. 无 sessionId 时忽略
 * 8. 不直接改变 message content
 * 9. 不直接发送消息
 * 10. 不打印 requestPayloadJson 原文
 *
 * 条款引用: E2.1, E10.1-E10.5, E11.1-E11.2, E28.6, E31.3, E32.5, E33.1
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Message } from "@/types";

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

const issueWsTicket = vi.fn();
const checkOnlineStatus = vi.fn();
const scheduleRealtimeResume = vi.fn();
const addMessage = vi.fn();
const loadFriendRequests = vi.fn();
const loadFriends = vi.fn();
const refreshSessionSkeletons = vi.fn();
const applyReadReceipt = vi.fn();
const messageError = vi.fn();
const messageInfo = vi.fn();
const notification = vi.fn();
const chatMessages = new Map<string, Message[]>();
const emitE2eeNegotiation = vi.fn();

// Console spy — E20/E32.5: verify requestPayloadJson not logged
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = "") {
    this.onclose?.({ code, reason });
  }
}

const elMessageFn = vi.fn();
vi.mock("element-plus", () => {
  const fn = (...args: unknown[]) => elMessageFn(...args);
  fn.error = messageError;
  fn.info = messageInfo;
  return {
    ElMessage: fn,
    ElNotification: notification,
  };
});

vi.mock("@/services", () => ({
  authService: { issueWsTicket },
  userService: { checkOnlineStatus },
}));

vi.mock("@/stores/chat", () => ({
  useChatStore: () => ({
    messages: chatMessages,
    scheduleRealtimeResume,
    addMessage,
    loadFriendRequests,
    loadFriends,
    refreshSessionSkeletons,
    applyReadReceipt,
  }),
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({ userId: "42" }),
}));

vi.mock("@/features/e2ee/negotiation-events", () => ({
  emitE2eeNegotiation,
}));

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    decryptMessage: vi.fn(),
    init: vi.fn(),
    clearSession: vi.fn(),
  },
}));

vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: vi.fn(),
  setLocalSessionStatus: vi.fn(),
  initiateNegotiation: vi.fn(),
}));

vi.mock("@/features/e2ee/manager/pending-messages", () => ({
  cachePendingMessage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_USER_ID = "42";

const makeEnvelope = (type: string, data?: Record<string, unknown>) => ({
  type,
  ...(data !== undefined ? { data } : {}),
  timestamp: Date.now(),
});

const connectStore = async (userId = CURRENT_USER_ID) => {
  issueWsTicket.mockResolvedValue({
    code: 200,
    data: { ticket: "ticket-negotiation", expiresInMs: 30_000 },
  });
  const { useWebSocketStore } = await import("@/stores/websocket");
  const store = useWebSocketStore();
  await store.connect(userId);
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  return { store, ws };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("E2EE negotiation event regression", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setActivePinia(createPinia());
    FakeWebSocket.instances = [];
    issueWsTicket.mockReset();
    checkOnlineStatus.mockReset();
    scheduleRealtimeResume.mockReset();
    addMessage.mockReset();
    loadFriendRequests.mockReset();
    loadFriends.mockReset();
    refreshSessionSkeletons.mockReset();
    applyReadReceipt.mockReset();
    messageError.mockReset();
    messageInfo.mockReset();
    notification.mockReset();
    elMessageFn.mockReset();
    emitE2eeNegotiation.mockReset();
    chatMessages.clear();
    scheduleRealtimeResume.mockResolvedValue(undefined);
    addMessage.mockResolvedValue(undefined);
    loadFriendRequests.mockResolvedValue(undefined);
    loadFriends.mockResolvedValue(undefined);
    refreshSessionSkeletons.mockResolvedValue(undefined);
    applyReadReceipt.mockResolvedValue(undefined);
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    localStorage.clear();

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  // =========================================================================
  // Scenario 1-4: Each action type emits event
  // E10.1-E10.4, E11.1, E11.2
  // =========================================================================

  describe("1. request action emits negotiation event", () => {
    it("emits event with action=request", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "request",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "request",
          sessionId: "21_42",
          requesterId: "21",
          requesterName: "Alice",
          targetUserId: "42",
        }),
      );
    });
  });

  describe("2. accepted action emits negotiation event", () => {
    it("emits event with action=accepted", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "accepted",
            requesterId: "42",
            requesterName: "Bob",
            targetUserId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({ action: "accepted" }),
      );
    });
  });

  describe("3. rejected action emits negotiation event", () => {
    it("emits event with action=rejected", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "rejected",
            requesterId: "42",
            requesterName: "Bob",
            targetUserId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({ action: "rejected" }),
      );
    });
  });

  describe("4. disabled action emits negotiation event", () => {
    it("emits event with action=disabled", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "disabled",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({ action: "disabled" }),
      );
    });
  });

  // =========================================================================
  // Scenario 5: snake_case payload fields parseable
  // E2.1, E11.2
  // =========================================================================

  describe("5. snake_case payload fields are parseable", () => {
    it("normalizes snake_case fields to camelCase event", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            session_id: "10_20",
            action: "request",
            requester_id: "10",
            requester_name: "Charlie",
            target_user_id: "20",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "10_20",
          action: "request",
          requesterId: "10",
          requesterName: "Charlie",
          targetUserId: "20",
        }),
      );
    });

    it("normalizes snake_case request_payload_json field", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            session_id: "10_20",
            action: "request",
            requester_id: "10",
            requester_name: "Charlie",
            target_user_id: "20",
            request_payload_json: '{"senderIdentityKey":"ik","ephemeralPublicKey":"ek","deviceId":"d1"}',
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({
          requestPayloadJson: '{"senderIdentityKey":"ik","ephemeralPublicKey":"ek","deviceId":"d1"}',
        }),
      );
    });
  });

  // =========================================================================
  // Scenario 6: camelCase payload fields parseable
  // E2.1, E11.2
  // =========================================================================

  describe("6. camelCase payload fields are parseable", () => {
    it("passes camelCase fields through directly", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "30_40",
            action: "accepted",
            requesterId: "30",
            requesterName: "Dave",
            targetUserId: "40",
            requestPayloadJson: '{"senderIdentityKey":"ik2"}',
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "30_40",
          action: "accepted",
          requesterId: "30",
          requesterName: "Dave",
          targetUserId: "40",
          requestPayloadJson: '{"senderIdentityKey":"ik2"}',
        }),
      );
    });
  });

  // =========================================================================
  // Scenario 7: Missing sessionId → dropped silently
  // E11.2
  // =========================================================================

  describe("7. missing sessionId drops event silently", () => {
    it("does not emit when sessionId is missing", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            action: "request",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });

    it("does not emit when sessionId is empty string", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "",
            action: "request",
            requesterId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });

    it("does not emit when both camelCase and snake_case sessionId are missing", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            action: "accepted",
            requesterId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 8: E2EE_NEGOTIATION does NOT change message content
  // E10.5, E11.2, E28.6
  // =========================================================================

  describe("8. negotiation event does not change message content", () => {
    it("does NOT call addMessage for any negotiation event", async () => {
      const actions = ["request", "accepted", "rejected", "disabled"] as const;

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      for (const action of actions) {
        addMessage.mockClear();
        ws.onmessage?.({
          data: JSON.stringify(
            makeEnvelope("E2EE_NEGOTIATION", {
              sessionId: "21_42",
              action,
              requesterId: "21",
              requesterName: "Alice",
              targetUserId: "42",
            }),
          ),
        });
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();

        // E10.5 / E11.2: negotiation is control-plane, not message
        expect(addMessage).not.toHaveBeenCalled();
      }
    });

    it("does not modify existing messages in chatMessages map", async () => {
      chatMessages.set("21_42", [
        {
          id: "msg_100",
          senderId: "21",
          receiverId: "42",
          messageType: "TEXT",
          content: "existing message",
          isGroupChat: false,
          sendTime: new Date().toISOString(),
          status: "SENT",
        },
      ]);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "request",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // Existing message untouched
      const messages = chatMessages.get("21_42");
      expect(messages).toHaveLength(1);
      expect(messages?.[0].content).toBe("existing message");
    });
  });

  // =========================================================================
  // Scenario 9: E2EE_NEGOTIATION does NOT send messages
  // E10.5, E11.2
  // =========================================================================

  describe("9. negotiation event does not send messages", () => {
    it("does NOT call any send API or websocket.send for negotiation events", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();
      ws.sent = []; // Clear any heartbeat etc.

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "request",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // E11.2: negotiation event must not trigger any outbound send
      // (ws.sent may contain heartbeat but nothing negotiation-related)
      const negotiationSends = ws.sent.filter(
        (s) => s.includes("E2EE") || s.includes("negotiation") || s.includes("requestPayload"),
      );
      expect(negotiationSends).toHaveLength(0);
    });

    it("does NOT trigger decryptMessage for negotiation events", async () => {
      const decryptMessageMock = vi.fn();
      vi.doMock("@/features/e2ee/manager/e2ee-manager", () => ({
        e2eeManager: {
          decryptMessage: (...args: unknown[]) => decryptMessageMock(...args),
          init: vi.fn(),
          clearSession: vi.fn(),
        },
      }));

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "accepted",
            requesterId: "42",
            requesterName: "Bob",
            targetUserId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // E10.5: negotiation is control-plane only, no crypto
      expect(decryptMessageMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 10: requestPayloadJson original text not logged
  // E20.1, E32.5
  // =========================================================================

  describe("10. requestPayloadJson original text is not logged", () => {
    it("does not log requestPayloadJson content to console", async () => {
      const secretPayload = '{"senderIdentityKey":"SENSITIVE_IK_BASE64","ephemeralPublicKey":"SENSITIVE_EK_BASE64","deviceId":"dev_secret"}';

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "request",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
            requestPayloadJson: secretPayload,
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      const allOutput = consoleErrorSpy.mock.calls.flat().join(" ")
        + consoleWarnSpy.mock.calls.flat().join(" ")
        + consoleLogSpy.mock.calls.flat().join(" ");

      // E20.1 / E32.5: requestPayloadJson must not appear in logs
      expect(allOutput).not.toContain("SENSITIVE_IK_BASE64");
      expect(allOutput).not.toContain("SENSITIVE_EK_BASE64");
      expect(allOutput).not.toContain("senderIdentityKey");
      expect(allOutput).not.toContain("ephemeralPublicKey");
    });

    it("does not log requestPayloadJson on snake_case field", async () => {
      const secretPayload = '{"senderIdentityKey":"SECRET_SNAKE_IK","ephemeralPublicKey":"SECRET_SNAKE_EK"}';

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            session_id: "21_42",
            action: "request",
            requester_id: "21",
            requester_name: "Alice",
            target_user_id: "42",
            request_payload_json: secretPayload,
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      const allOutput = consoleErrorSpy.mock.calls.flat().join(" ")
        + consoleWarnSpy.mock.calls.flat().join(" ")
        + consoleLogSpy.mock.calls.flat().join(" ");

      expect(allOutput).not.toContain("SECRET_SNAKE_IK");
      expect(allOutput).not.toContain("SECRET_SNAKE_EK");
    });
  });

  // =========================================================================
  // Additional: invalid action → dropped
  // E11.2
  // =========================================================================

  describe("11. invalid action is dropped", () => {
    it("drops negotiation event with unrecognized action", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "unknown_action",
            requesterId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });

    it("drops negotiation event with missing action", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            requesterId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Additional: E2EE_NEGOTIATION with null data → no-op
  // E11.2
  // =========================================================================

  describe("12. E2EE_NEGOTIATION with null/missing data is no-op", () => {
    it("does not emit when data is missing", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify({
          type: "E2EE_NEGOTIATION",
          timestamp: Date.now(),
        }),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Additional: E2EE_NEGOTIATION event bus — onE2eeNegotiation listener
  // E10.1-E10.4
  // =========================================================================

  describe("13. negotiation event bus onE2eeNegotiation subscription", () => {
    it("receives all four action types via real event bus", async () => {
      // Use real module (bypass mock) to test the actual event bus wiring
      const realModule = await vi.importActual<
        typeof import("@/features/e2ee/negotiation-events")
      >("@/features/e2ee/negotiation-events");

      const received: Array<{ action: string; sessionId: string }> = [];
      const unsubscribe = realModule.onE2eeNegotiation((event) => {
        received.push({ action: event.action, sessionId: event.sessionId });
      });

      const actions = ["request", "accepted", "rejected", "disabled"] as const;
      for (const action of actions) {
        realModule.emitE2eeNegotiation({
          action,
          sessionId: "21_42",
          requesterId: "21",
          requesterName: "Alice",
          targetUserId: "42",
        });
      }

      expect(received).toEqual(
        actions.map((action) => ({ action, sessionId: "21_42" })),
      );

      unsubscribe();
    });

    it("unsubscribe stops receiving events", async () => {
      const realModule = await vi.importActual<
        typeof import("@/features/e2ee/negotiation-events")
      >("@/features/e2ee/negotiation-events");

      const received: Array<{ action: string }> = [];
      const unsubscribe = realModule.onE2eeNegotiation((event) => {
        received.push({ action: event.action });
      });

      realModule.emitE2eeNegotiation({
        action: "request",
        sessionId: "21_42",
        requesterId: "21",
        requesterName: "Alice",
        targetUserId: "42",
      });
      expect(received).toHaveLength(1);

      unsubscribe();

      realModule.emitE2eeNegotiation({
        action: "accepted",
        sessionId: "21_42",
        requesterId: "42",
        requesterName: "Bob",
        targetUserId: "21",
      });
      expect(received).toHaveLength(1);
    });
  });
});
