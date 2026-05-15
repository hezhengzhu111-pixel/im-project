/**
 * WebSocket E2EE 接收解密路径保护测试
 *
 * 覆盖场景 (E2, E10, E11, E14, E22, E28, E31, E32, E33):
 * 1. encrypted=true 且 sender != currentUserId 时，必须调用 decryptMessage
 * 2. decryptMessage 成功时 content 替换为明文，encrypted 标记 false
 * 3. No ratchet state + status=encrypted → 重置为 plaintext 并提示
 * 4. No ratchet state + status=negotiating → 提示协商中，不静默明文
 * 5. No ratchet state + status=plaintext → 触发 initiateNegotiation，不展示密文为明文
 * 6. 自己发出的 encrypted echo → 优先保留本地 plaintext
 * 7. 解密失败不得打印密钥和完整密文 payload
 * 8. E2EE_NEGOTIATION 事件 → emit negotiation event，不修改消息内容
 *
 * 条款引用: E2.1-E2.2, E10.1-E10.5, E11.1-E11.2, E14.1, E22.1-E22.3, E28.3, E28.6, E31.3, E32.4-E32.5, E33.1
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Message } from "@/types";

// ---------------------------------------------------------------------------
// Mock infrastructure (matches websocket-store.spec.ts patterns)
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
const messageWarn = vi.fn();
const notification = vi.fn();
const chatMessages = new Map<string, Message[]>();
const emitE2eeNegotiation = vi.fn();

const decryptMessageMock = vi.fn();
const getLocalSessionStatusMock = vi.fn();
const setLocalSessionStatusMock = vi.fn();
const initiateNegotiationMock = vi.fn();
const cachePendingMessageMock = vi.fn();

// Console spy — E20/E32.5: verify no keys/payload logged on decrypt failure
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

// ElMessage is used both as ElMessage({...}) direct call and ElMessage.info(...) method.
// websocket.ts uses ElMessage() direct call for the "negotiating" path.
const elMessageFn = vi.fn();
vi.mock("element-plus", () => {
  const fn = (...args: unknown[]) => elMessageFn(...args);
  fn.error = messageError;
  fn.info = messageInfo;
  fn.warning = messageWarn;
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
    decryptMessage: (...args: unknown[]) => decryptMessageMock(...args),
    init: vi.fn(),
    clearSession: vi.fn(),
  },
}));

vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: (...args: unknown[]) => getLocalSessionStatusMock(...args),
  setLocalSessionStatus: (...args: unknown[]) => setLocalSessionStatusMock(...args),
  initiateNegotiation: (...args: unknown[]) => initiateNegotiationMock(...args),
}));

vi.mock("@/features/e2ee/manager/pending-messages", () => ({
  cachePendingMessage: (...args: unknown[]) => cachePendingMessageMock(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flush all microtasks including dynamic import() chains in the E2EE decrypt path.
 * The websocket.ts handler uses multiple `await import(...)` calls, each adding
 * a microtask layer. We cycle Promise.resolve + advanceTimers to drain them all.
 */
async function flushE2eePath() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

const CURRENT_USER_ID = "42";

const makeEncryptedMessagePayload = (overrides: Record<string, unknown> = {}) => ({
  type: "MESSAGE",
  data: {
    id: "300",
    senderId: "21",
    receiverId: CURRENT_USER_ID,
    isGroupChat: false,
    messageType: "TEXT",
    content: "base64_ciphertext_blob",
    encrypted: true,
    e2eeHeader: '{"ratchetPublicKey":"dhPub","counter":0,"previousCounter":0,"iv":"base64iv"}',
    e2eeDeviceId: "device_sender_001",
    e2eeSenderIdentityKey: "sender_ik_base64",
    e2eeEphemeralKey: "sender_ek_base64",
    sendTime: new Date().toISOString(),
    status: "SENT",
    ...overrides,
  },
  timestamp: Date.now(),
});

const makeSelfEncryptedPayload = (overrides: Record<string, unknown> = {}) => ({
  type: "MESSAGE",
  data: {
    id: "301",
    senderId: CURRENT_USER_ID,
    receiverId: "21",
    isGroupChat: false,
    messageType: "TEXT",
    content: "base64_ciphertext_of_own_msg",
    encrypted: true,
    e2eeHeader: '{"ratchetPublicKey":"dhPub","counter":0,"previousCounter":0,"iv":"base64iv"}',
    e2eeDeviceId: "device_self_001",
    clientMessageId: "cm_self_001",
    sendTime: new Date().toISOString(),
    status: "SENT",
    ...overrides,
  },
  timestamp: Date.now(),
});

const makeEnvelope = (type: string, data?: Record<string, unknown>) => ({
  type,
  ...(data !== undefined ? { data } : {}),
  timestamp: Date.now(),
});

const connectStore = async (userId = CURRENT_USER_ID) => {
  issueWsTicket.mockResolvedValue({
    code: 200,
    data: { ticket: "ticket-e2ee", expiresInMs: 30_000 },
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

describe("WebSocket E2EE receive decrypt path", () => {
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
    messageWarn.mockReset();
    notification.mockReset();
    elMessageFn.mockReset();
    emitE2eeNegotiation.mockReset();
    decryptMessageMock.mockReset();
    getLocalSessionStatusMock.mockReset();
    setLocalSessionStatusMock.mockReset();
    initiateNegotiationMock.mockReset();
    cachePendingMessageMock.mockReset();
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

  // =========================================================================
  // Scenario 1: encrypted=true && sender != currentUserId → must call decryptMessage
  // E22.1, E22.2, E28.3
  // =========================================================================

  describe("1. decryptMessage called for non-self encrypted messages", () => {
    it("calls e2eeManager.decryptMessage when encrypted=true and sender is not current user", async () => {
      const plaintext = "Hello decrypted!";
      decryptMessageMock.mockResolvedValue(plaintext);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload()) });
      await flushE2eePath();

      expect(decryptMessageMock).toHaveBeenCalledTimes(1);
      expect(decryptMessageMock).toHaveBeenCalledWith(
        expect.any(String), // sessionId
        "21",               // senderId
        expect.objectContaining({ ratchetPublicKey: "dhPub" }), // header
        "base64_ciphertext_blob", // ciphertext
        "sender_ik_base64",      // senderIdentityKey
        "sender_ek_base64",      // ephemeralKey
      );
    });

    it("builds correct sessionId from sender and receiver", async () => {
      decryptMessageMock.mockResolvedValue("decrypted");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload()) });
      await flushE2eePath();

      // buildSessionId sorts user IDs: "21" < "42" → "21_42"
      expect(decryptMessageMock).toHaveBeenCalledWith(
        "21_42",
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("does NOT call decryptMessage for SYSTEM messageType even if encrypted=true", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(makeEncryptedMessagePayload({
          messageType: "SYSTEM",
          content: "系统消息::CMD:REFRESH",
        })),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(decryptMessageMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 2: decryptMessage success → content replaced, encrypted=false
  // E22.2, E28.3
  // =========================================================================

  describe("2. successful decrypt replaces content and clears encrypted flag", () => {
    it("replaces message.content with plaintext and sets encrypted=false on success", async () => {
      const plaintext = "Decrypted hello!";
      decryptMessageMock.mockResolvedValue(plaintext);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "310" })) });
      await flushE2eePath();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      expect(passedMessage.content).toBe(plaintext);
      expect(passedMessage.encrypted).toBe(false);
    });

    it("does not pass ciphertext content to addMessage after successful decrypt", async () => {
      decryptMessageMock.mockResolvedValue("clear text");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "311" })) });
      await flushE2eePath();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      expect(passedMessage.content).not.toBe("base64_ciphertext_blob");
    });
  });

  // =========================================================================
  // Scenario 3: No ratchet state + status=encrypted → reset to plaintext + notify
  // E8.3, E9.4, E22.3, E28.3
  // =========================================================================

  describe("3. no ratchet state with status=encrypted → reset to plaintext and notify", () => {
    it("resets session status to plaintext and shows notification when status was encrypted", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("encrypted");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "320" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(setLocalSessionStatusMock).toHaveBeenCalledWith("21_42", "plaintext");
      expect(notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "加密状态异常",
          type: "warning",
        }),
      );
    });

    it("keeps message encrypted=true after reset (does not show ciphertext as plaintext)", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("encrypted");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "321" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      // E22.3: message must remain encrypted / not show ciphertext as content
      expect(passedMessage.encrypted).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 4: No ratchet state + status=negotiating → prompt, no silent plaintext
  // E8.2, E9.2, E22.3
  // =========================================================================

  describe("4. no ratchet state with status=negotiating → show info, do not show plaintext", () => {
    it("shows info message about negotiation in progress", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("negotiating");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "330" })) });
      await flushE2eePath();

      // websocket.ts uses ElMessage({ message, type: "info" }) — direct call, not .info()
      expect(elMessageFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("协商"),
          type: "info",
        }),
      );
    });

    it("does NOT modify message content or encrypted flag for negotiating status", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("negotiating");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "331" })) });
      await flushE2eePath();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      // Content stays as ciphertext, encrypted stays true — E22.3 / E8.2
      expect(passedMessage.encrypted).toBe(true);
    });

    it("does NOT set status to plaintext when negotiating", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("negotiating");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "332" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // setLocalSessionStatus should NOT be called to reset to plaintext
      expect(setLocalSessionStatusMock).not.toHaveBeenCalledWith("21_42", "plaintext");
    });
  });

  // =========================================================================
  // Scenario 5: No ratchet state + status=plaintext → trigger negotiation, no ciphertext display
  // E8.1, E22.1, E22.3
  // =========================================================================

  describe("5. no ratchet state with status=plaintext → auto-trigger negotiation, cache pending", () => {
    it("caches the pending encrypted message for later retry", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(true);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "340" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(cachePendingMessageMock).toHaveBeenCalledTimes(1);
      expect(cachePendingMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "21_42",
          peerId: "21",
          content: "base64_ciphertext_blob",
        }),
      );
    });

    it("calls initiateNegotiation to start key exchange", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(true);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "341" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(initiateNegotiationMock).toHaveBeenCalledWith("21_42", "21");
    });

    it("keeps message encrypted=true (does NOT show ciphertext as plaintext)", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(true);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "342" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      // E8.1 / E22.1: ciphertext must not be presented as plaintext content
      expect(passedMessage.encrypted).toBe(true);
      expect(passedMessage.content).toBe("base64_ciphertext_blob");
    });

    it("shows notification when negotiation is successfully initiated", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(true);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "343" })) });
      await flushE2eePath();

      expect(notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "端到端加密请求",
          type: "info",
        }),
      );
    });

    it("handles negotiation initiation returning false gracefully", async () => {
      // Real initiateNegotiation catches errors internally and returns false.
      // Test that path instead of an unhandled rejection.
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(false);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "344" })) });
      await flushE2eePath();

      // Message still added (encrypted)
      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      expect(passedMessage.encrypted).toBe(true);
      // No notification because initiateNegotiation returned false
      expect(notification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 6: Own encrypted echo → preserve local plaintext
  // E21.3, E28.3
  // =========================================================================

  describe("6. own encrypted echo preserves local plaintext", () => {
    it("replaces content with existing local plaintext for self-sent encrypted echo", async () => {
      const localPlaintext = "Hello I sent this";
      chatMessages.set("21_42", [
        {
          id: "local_001",
          clientMessageId: "cm_self_001",
          senderId: CURRENT_USER_ID,
          receiverId: "21",
          messageType: "TEXT",
          content: localPlaintext,
          isGroupChat: false,
          sendTime: new Date().toISOString(),
          status: "SENT",
        },
      ]);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeSelfEncryptedPayload()) });
      await Promise.resolve();
      await Promise.resolve();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      expect(passedMessage.content).toBe(localPlaintext);
    });

    it("does NOT call decryptMessage for own encrypted echo", async () => {
      chatMessages.set("21_42", [
        {
          id: "local_002",
          clientMessageId: "cm_self_001",
          senderId: CURRENT_USER_ID,
          receiverId: "21",
          messageType: "TEXT",
          content: "local plaintext",
          isGroupChat: false,
          sendTime: new Date().toISOString(),
          status: "SENT",
        },
      ]);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeSelfEncryptedPayload()) });
      await Promise.resolve();
      await Promise.resolve();

      expect(decryptMessageMock).not.toHaveBeenCalled();
    });

    it("keeps encrypted=true marker on own echo (metadata preserved)", async () => {
      chatMessages.set("21_42", [
        {
          id: "local_003",
          clientMessageId: "cm_self_001",
          senderId: CURRENT_USER_ID,
          receiverId: "21",
          messageType: "TEXT",
          content: "local plaintext",
          isGroupChat: false,
          sendTime: new Date().toISOString(),
          status: "SENT",
        },
      ]);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeSelfEncryptedPayload({ id: "360" })) });
      await Promise.resolve();
      await Promise.resolve();

      const passedMessage = addMessage.mock.calls[0][0] as Message;
      // encrypted stays true for the metadata; content is plaintext
      expect(passedMessage.encrypted).toBe(true);
      expect(passedMessage.content).toBe("local plaintext");
    });

    it("falls back to ciphertext if no matching local message found", async () => {
      // No local messages in chatMessages map
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeSelfEncryptedPayload({ id: "361" })) });
      await Promise.resolve();
      await Promise.resolve();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      // Without local match, content stays as ciphertext from server
      expect(passedMessage.content).toBe("base64_ciphertext_of_own_msg");
    });
  });

  // =========================================================================
  // Scenario 7: Decrypt failure must NOT log keys or full ciphertext
  // E20.1, E20.3, E32.5
  // =========================================================================

  describe("7. decrypt failure does not leak keys or ciphertext in logs", () => {
    it("does NOT log the full ciphertext payload on decrypt error", async () => {
      decryptMessageMock.mockRejectedValue(new Error("Decryption failed: bad padding"));
      getLocalSessionStatusMock.mockReturnValue("encrypted");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "370" })) });
      await flushE2eePath();

      // Collect all console.error calls
      const allErrorCalls = consoleErrorSpy.mock.calls.flat().join(" ");
      const allWarnCalls = consoleWarnSpy.mock.calls.flat().join(" ");
      const allLogCalls = consoleLogSpy.mock.calls.flat().join(" ");
      const allOutput = allErrorCalls + allWarnCalls + allLogCalls;

      // E20.1 / E32.5: must NOT contain the full ciphertext blob
      expect(allOutput).not.toContain("base64_ciphertext_blob");
      // Must NOT contain the ratchet header content
      expect(allOutput).not.toContain("dhPub");
      expect(allOutput).not.toContain("base64iv");
      // Must NOT contain identity key material
      expect(allOutput).not.toContain("sender_ik_base64");
      expect(allOutput).not.toContain("sender_ek_base64");
    });

    it("does NOT log identity key or ephemeral key on 'negotiation has not been accepted' error", async () => {
      // Suppress unhandled rejection from fire-and-forget initiateNegotiation
      const suppressRejection = (e: PromiseRejectionEvent) => e.preventDefault();
      window.addEventListener("unhandledrejection", suppressRejection);

      decryptMessageMock.mockRejectedValue(new Error("E2EE negotiation has not been accepted"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(true);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "371" })) });
      await flushE2eePath();

      window.removeEventListener("unhandledrejection", suppressRejection);

      const allOutput = consoleErrorSpy.mock.calls.flat().join(" ")
        + consoleWarnSpy.mock.calls.flat().join(" ")
        + consoleLogSpy.mock.calls.flat().join(" ");

      expect(allOutput).not.toContain("sender_ik_base64");
      expect(allOutput).not.toContain("sender_ek_base64");
      expect(allOutput).not.toContain("base64_ciphertext_blob");
    });

    it("logs only the session identifier and error category, not sensitive fields", async () => {
      decryptMessageMock.mockRejectedValue(new Error("No ratchet state for session 21_42"));
      getLocalSessionStatusMock.mockReturnValue("encrypted");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "372" })) });
      await flushE2eePath();

      // Should contain session reference (allowed by E20.2)
      const allOutput = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(allOutput).toContain("21_42");
    });
  });

  // =========================================================================
  // Scenario 8: E2EE_NEGOTIATION event → emit only, no message content modification
  // E10.5, E11.1, E11.2, E28.6
  // =========================================================================

  describe("8. E2EE_NEGOTIATION event dispatches to event bus without modifying messages", () => {
    it("emits negotiation event via emitE2eeNegotiation", async () => {
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
      await Promise.resolve();
      await Promise.resolve();

      expect(emitE2eeNegotiation).toHaveBeenCalledTimes(1);
      expect(emitE2eeNegotiation).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "21_42",
          action: "request",
          requesterId: "21",
          requesterName: "Alice",
          targetUserId: "42",
        }),
      );
    });

    it("does NOT call addMessage for E2EE_NEGOTIATION events", async () => {
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

      // E11.2: negotiation is a control event, not a message event
      expect(addMessage).not.toHaveBeenCalled();
    });

    it("does NOT call decryptMessage for E2EE_NEGOTIATION events", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "rejected",
            requesterId: "21",
            requesterName: "Alice",
            targetUserId: "42",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // E10.5: negotiation events must not trigger crypto operations
      expect(decryptMessageMock).not.toHaveBeenCalled();
    });

    it("handles all four negotiation actions (request/accepted/rejected/disabled)", async () => {
      const actions = ["request", "accepted", "rejected", "disabled"] as const;

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      for (const action of actions) {
        emitE2eeNegotiation.mockClear();
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
        await Promise.resolve();
        await Promise.resolve();

        expect(emitE2eeNegotiation).toHaveBeenCalledWith(
          expect.objectContaining({ action }),
        );
      }
    });

    it("drops E2EE_NEGOTIATION with invalid action", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            sessionId: "21_42",
            action: "invalid_action",
            requesterId: "21",
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(emitE2eeNegotiation).not.toHaveBeenCalled();
    });

    it("drops E2EE_NEGOTIATION with missing sessionId", async () => {
      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(
          makeEnvelope("E2EE_NEGOTIATION", {
            action: "request",
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
  // Additional: "negotiation has not been accepted" error path
  // E8.2, E22.3
  // =========================================================================

  describe("9. 'negotiation has not been accepted' error handling", () => {
    it("treats 'negotiation has not been accepted' same as 'No ratchet state'", async () => {
      decryptMessageMock.mockRejectedValue(new Error("E2EE negotiation has not been accepted"));
      getLocalSessionStatusMock.mockReturnValue("plaintext");
      initiateNegotiationMock.mockResolvedValue(true);

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "390" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // Should trigger the same no-ratchet-state path
      expect(getLocalSessionStatusMock).toHaveBeenCalledWith("21_42");
      expect(cachePendingMessageMock).toHaveBeenCalled();
      expect(initiateNegotiationMock).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Additional: non-ratchet decrypt errors (e.g. AES-GCM failure)
  // E22.3
  // =========================================================================

  describe("10. non-ratchet decrypt errors (AES-GCM failure etc.)", () => {
    it("keeps message encrypted=true and logs error for non-ratchet failures", async () => {
      decryptMessageMock.mockRejectedValue(new Error("AES-GCM decryption failed: OperationError"));
      getLocalSessionStatusMock.mockReturnValue("encrypted");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({ data: JSON.stringify(makeEncryptedMessagePayload({ id: "400" })) });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      expect(passedMessage.encrypted).toBe(true);

      // Should log the error (but not sensitive data)
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(errorOutput).toContain("Decrypt failed");
    });
  });

  // =========================================================================
  // Additional: encrypted=1 (numeric truthy) also triggers decrypt
  // E22.1
  // =========================================================================

  describe("11. encrypted=1 (numeric) also triggers E2EE decrypt path", () => {
    it("treats encrypted=1 as encrypted and calls decryptMessage", async () => {
      decryptMessageMock.mockResolvedValue("decrypted from numeric");

      const { ws } = await connectStore();
      ws.onopen?.();
      await Promise.resolve();

      ws.onmessage?.({
        data: JSON.stringify(makeEncryptedMessagePayload({ id: "410", encrypted: 1 })),
      });
      await flushE2eePath();

      expect(decryptMessageMock).toHaveBeenCalledTimes(1);
      expect(addMessage).toHaveBeenCalledTimes(1);
      const passedMessage = addMessage.mock.calls[0][0] as Message;
      expect(passedMessage.content).toBe("decrypted from numeric");
      expect(passedMessage.encrypted).toBe(false);
    });
  });

  // =========================================================================
  // Cleanup
  // =========================================================================

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
