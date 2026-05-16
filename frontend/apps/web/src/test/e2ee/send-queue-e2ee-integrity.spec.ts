/**
 * E2EE 发送队列完整性测试 — 补齐项
 *
 * 覆盖场景 (E8, E21, E24, E25, E28, E31, E32, E33):
 * 1. 离线 retry payload 保留所有 E2EE metadata（e2eeHeader, e2eeDeviceId, e2eeSenderIdentityKey, e2eeEphemeralKey）
 * 2. 离线 retry payload 不包含明文 content
 * 3. 离线 retry payload 不包含媒体字段泄漏
 * 4. 离线 retry payload 顶层和 data 层都标记 encrypted=true
 * 5. 加密失败不创建离线 retry payload
 * 6. negotiating 状态不创建任何 payload
 * 7. failed 状态不创建任何 payload
 *
 * 条款引用: E8.1-E8.4, E21.1-E21.3, E24.1-E24.4, E25.1-E25.2, E28.2, E31.2, E32.4-E32.6, E33.1
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Message, ChatSession } from "@/types";

const encryptMessageMock = vi.fn();
const getLocalSessionStatusMock = vi.fn();
type InitialE2eeHandshake = {
  senderIdentityKey: string;
  ephemeralPublicKey: string;
  deviceId: string;
};
const getPendingInitialHandshakeMock = vi.fn(
  (..._args: unknown[]): InitialE2eeHandshake | null => null,
);
const clearPendingInitialHandshakeMock = vi.fn((..._args: unknown[]) => undefined);

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    encryptMessage: (...args: unknown[]) => encryptMessageMock(...args),
  },
}));

vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: (...args: unknown[]) =>
    getLocalSessionStatusMock(...args),
  getPendingInitialHandshake: (...args: unknown[]) =>
    getPendingInitialHandshakeMock(...args),
  clearPendingInitialHandshake: (...args: unknown[]) =>
    clearPendingInitialHandshakeMock(...args),
}));

vi.mock("@/normalizers/chat", () => ({
  safePreferExistingId: (server: string, local: string) => server || local,
}));

vi.mock("@/utils/messageNormalize", () => ({
  splitTextByCodePoints: (text: string) => [text],
}));

import { createMessageSendQueueModule } from "@/stores/modules/message-send-queue";

const makeSession = (overrides?: Partial<ChatSession>): ChatSession => ({
  id: "sess_1",
  type: "private",
  targetId: "user_2",
  targetName: "Bob",
  unreadCount: 0,
  lastActiveTime: "",
  isPinned: false,
  isMuted: false,
  ...overrides,
});

const makeCtx = () => {
  const messages = ref(new Map<string, Message[]>());
  const sendQueueBySession = ref(new Map<string, Promise<void>>());
  const messageTextConfig = ref(null);

  const sendPrivate = vi.fn().mockResolvedValue({
    data: {
      id: "srv_1",
      clientMessageId: "cm_1",
      senderId: "user_1",
      receiverId: "user_2",
      status: "SENT",
    },
  });
  const sendPrivateEncrypted = vi.fn().mockResolvedValue({
    data: {
      id: "srv_2",
      clientMessageId: "cm_2",
      senderId: "user_1",
      receiverId: "user_2",
      status: "SENT",
    },
  });
  const sendGroup = vi.fn().mockResolvedValue({
    data: {
      id: "srv_3",
      clientMessageId: "cm_3",
      senderId: "user_1",
      groupId: "group_1",
      status: "SENT",
    },
  });
  const getConfig = vi.fn().mockResolvedValue({
    data: { textEnforce: false, textMaxLength: 2000 },
  });

  const addMessage = vi.fn().mockResolvedValue(undefined);
  const notifyWarning = vi.fn();
  const syncHistoryState = vi.fn();
  const applyMessageToSession = vi.fn();
  const upsertPendingMessage = vi.fn().mockResolvedValue(undefined);
  const removePendingMessage = vi.fn().mockResolvedValue(undefined);
  const addPendingMessage = vi.fn().mockResolvedValue(undefined);
  const scheduleServerMessagePersist = vi.fn().mockResolvedValue(undefined);

  return {
    messages,
    sendQueueBySession,
    messageTextConfig,
    messageService: {
      sendPrivate,
      sendPrivateEncrypted,
      sendGroup,
      getConfig,
    },
    messageRepo: {
      upsertPendingMessage,
      removePendingMessage,
      addPendingMessage,
    },
    sessionStore: {
      applyMessageToSession,
    },
    getCurrentUser: () => ({
      id: "user_1",
      username: "alice",
      nickname: "Alice",
    }),
    addMessage,
    notifyWarning,
    syncHistoryState,
    scheduleServerMessagePersist,
    _mocks: {
      sendPrivate,
      sendPrivateEncrypted,
      sendGroup,
      addMessage,
      notifyWarning,
      upsertPendingMessage,
      removePendingMessage,
      addPendingMessage,
      applyMessageToSession,
      scheduleServerMessagePersist,
    },
  };
};

// ============================================================================
// Test Suite
// ============================================================================

describe("send-queue E2EE integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Scenario 1: Offline retry payload preserves ALL E2EE metadata
  // E21, E24, E25, E28
  // ==========================================================================

  describe("1. offline retry payload preserves all E2EE metadata", () => {
    it("includes e2eeHeader, e2eeDeviceId in offline payload", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockResolvedValue({
        ciphertext: "encrypted_data",
        header: { ratchetPublicKey: "dh_pub_key", counter: 5, previousCounter: 2 },
        deviceId: "device_abc",
      });

      ctx._mocks.sendPrivateEncrypted.mockRejectedValue(
        Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
      );

      const session = makeSession();
      const result = await sendMessage(session, "secret message", "TEXT");

      expect(result).toBe(false);

      const addCalls = ctx._mocks.addPendingMessage.mock.calls;
      expect(addCalls.length).toBe(1);
      const payload = addCalls[0][2];

      // E24/E25: encrypted payload must contain all E2EE fields
      expect(payload.encrypted).toBe(true);
      expect(payload.data.encrypted).toBe(true);
      expect(payload.data.e2eeHeader).toBe(
        JSON.stringify({ ratchetPublicKey: "dh_pub_key", counter: 5, previousCounter: 2 }),
      );
      expect(payload.data.e2eeDeviceId).toBe("device_abc");
    });

    it("includes e2eeSenderIdentityKey and e2eeEphemeralKey when initial handshake exists", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockResolvedValue({
        ciphertext: "encrypted_data",
        header: { ratchetPublicKey: "key", counter: 0, previousCounter: 0 },
        deviceId: "dev_1",
      });
      getPendingInitialHandshakeMock.mockReturnValue({
        senderIdentityKey: "sender_ik_base64",
        ephemeralPublicKey: "ephemeral_pk_base64",
        deviceId: "dev_1",
      });

      ctx._mocks.sendPrivateEncrypted.mockRejectedValue(
        Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
      );

      const session = makeSession();
      await sendMessage(session, "first encrypted message", "TEXT");

      const addCalls = ctx._mocks.addPendingMessage.mock.calls;
      expect(addCalls.length).toBe(1);
      const payload = addCalls[0][2];

      // E21: initial handshake metadata must be preserved in retry payload
      expect(payload.data.e2eeSenderIdentityKey).toBe("sender_ik_base64");
      expect(payload.data.e2eeEphemeralKey).toBe("ephemeral_pk_base64");
    });

    it("offline payload sendType is 'private' for encrypted session", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockResolvedValue({
        ciphertext: "cipher",
        header: { ratchetPublicKey: "k", counter: 0, previousCounter: 0 },
        deviceId: "d",
      });

      ctx._mocks.sendPrivateEncrypted.mockRejectedValue(
        Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
      );

      const session = makeSession();
      await sendMessage(session, "test", "TEXT");

      const payload = ctx._mocks.addPendingMessage.mock.calls[0][2];
      expect(payload.sendType).toBe("private");
    });
  });

  // ==========================================================================
  // Scenario 2: Offline retry payload does NOT contain plaintext
  // E8, E25, E32
  // ==========================================================================

  describe("2. offline retry payload does NOT contain plaintext", () => {
    it("content field is ciphertext, not original plaintext", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockResolvedValue({
        ciphertext: "ciphertext_blob_base64",
        header: { ratchetPublicKey: "k", counter: 0, previousCounter: 0 },
        deviceId: "dev",
      });

      ctx._mocks.sendPrivateEncrypted.mockRejectedValue(
        Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
      );

      const session = makeSession();
      await sendMessage(session, "my secret plaintext", "TEXT");

      const payload = ctx._mocks.addPendingMessage.mock.calls[0][2];

      // E8.1/E25.1: must NOT contain plaintext
      expect(payload.data.content).toBe("ciphertext_blob_base64");
      expect(payload.data.content).not.toBe("my secret plaintext");
    });

    it("offline payload has no extra field that could leak plaintext", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockResolvedValue({
        ciphertext: "cipher",
        header: { ratchetPublicKey: "k", counter: 0, previousCounter: 0 },
        deviceId: "dev",
      });

      ctx._mocks.sendPrivateEncrypted.mockRejectedValue(
        Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
      );

      const session = makeSession();
      await sendMessage(session, "secret", "TEXT");

      const payload = ctx._mocks.addPendingMessage.mock.calls[0][2];

      // E24: must not contain media fields or extra
      expect(payload.data).not.toHaveProperty("extra");
      expect(payload.data).not.toHaveProperty("mediaUrl");
      expect(payload.data).not.toHaveProperty("mediaSize");
      expect(payload.data).not.toHaveProperty("mediaName");
      expect(payload.data).not.toHaveProperty("thumbnailUrl");
      expect(payload.data).not.toHaveProperty("duration");
    });
  });

  // ==========================================================================
  // Scenario 3: Encryption failure does NOT create offline retry
  // E8, E24
  // ==========================================================================

  describe("3. encryption failure does NOT create offline retry", () => {
    it("no offline payload when encryptMessage throws", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockRejectedValue(new Error("ratchet state corrupted"));

      const session = makeSession();
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(false);
      expect(ctx._mocks.addPendingMessage).not.toHaveBeenCalled();
    });

    it("no offline payload when encryptMessage returns null", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("encrypted");
      encryptMessageMock.mockResolvedValue(null);

      const session = makeSession();
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(false);
      expect(ctx._mocks.addPendingMessage).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scenario 4: negotiating / failed status blocks all send paths
  // E8, E9, E21
  // ==========================================================================

  describe("4. negotiating and failed status block all send paths", () => {
    it("negotiating status blocks send and does not create offline payload", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("negotiating");

      const session = makeSession();
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(false);
      expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
      expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
      expect(ctx._mocks.addPendingMessage).not.toHaveBeenCalled();
      expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
        "端到端加密协商尚未完成，请等待对方确认。",
      );
    });

    it("failed status blocks send (treated same as negotiating for send queue)", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("failed");

      const session = makeSession();
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(false);
      expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
      expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
      expect(ctx._mocks.addPendingMessage).not.toHaveBeenCalled();
      expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
        "E2EE session is unavailable; message was not sent.",
      );
    });
  });

  // ==========================================================================
  // Scenario 5: E2EE module load failure blocks send for private sessions
  // E8, E28
  // ==========================================================================

  describe("5. E2EE module load failure blocks send", () => {
    it("blocks send when E2EE module cannot be loaded", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockImplementation(() => {
        throw new Error("Module not found");
      });

      const session = makeSession();
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(false);
      expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
      expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scenario 6: Plaintext session does not use encrypted send
  // E21
  // ==========================================================================

  describe("6. plaintext session uses normal send", () => {
    it("uses sendPrivate for plaintext session", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("plaintext");

      const session = makeSession();
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(true);
      expect(ctx._mocks.sendPrivate).toHaveBeenCalled();
      expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    });

    it("plaintext offline payload does not have encrypted fields", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      getLocalSessionStatusMock.mockReturnValue("plaintext");

      ctx._mocks.sendPrivate.mockRejectedValue(
        Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
      );

      const session = makeSession();
      await sendMessage(session, "normal message", "TEXT");

      const payload = ctx._mocks.addPendingMessage.mock.calls[0][2];
      expect(payload.sendType).toBe("private");
      expect(payload.data.content).toBe("normal message");
      expect(payload.data).not.toHaveProperty("encrypted");
      expect(payload.data).not.toHaveProperty("e2eeHeader");
      expect(payload.data).not.toHaveProperty("e2eeDeviceId");
    });
  });

  // ==========================================================================
  // Scenario 7: Group sessions bypass E2EE
  // E2.5
  // ==========================================================================

  describe("7. group sessions bypass E2EE", () => {
    it("uses sendGroup for group sessions without checking E2EE", async () => {
      const ctx = makeCtx();
      const { sendMessage } = createMessageSendQueueModule(ctx as never);

      const session = makeSession({ type: "group", targetId: "group_1" });
      const result = await sendMessage(session, "hello", "TEXT");

      expect(result).toBe(true);
      expect(getLocalSessionStatusMock).not.toHaveBeenCalled();
      expect(ctx._mocks.sendGroup).toHaveBeenCalled();
    });
  });
});
