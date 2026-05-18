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
    // expose mocks for assertions
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

describe("message-send-queue E2EE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("marks message FAILED and does not send when encrypted session and encryptMessage throws", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "encrypted");
    encryptMessageMock.mockRejectedValue(new Error("ratchet state corrupted"));

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
      "端到端加密失败，消息未发送",
    );

    expect(ctx._mocks.upsertPendingMessage).not.toHaveBeenCalled();
  });

  it("marks message FAILED when encryptMessage returns null payload", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "encrypted");
    encryptMessageMock.mockResolvedValue(null);

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
      "端到端加密失败，消息未发送",
    );
  });

  it("marks message FAILED when encryptMessage returns empty ciphertext", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "",
      header: { dhPubKey: "abc" },
      deviceId: "dev_1",
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
  });

  it("uses plaintext sendPrivate when session status is plaintext", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "plaintext");

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(ctx._mocks.sendPrivate).toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
  });

  it("uses sendPrivateEncrypted when encryption succeeds", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_data",
      header: { dhPubKey: "abc" },
      deviceId: "dev_1",
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(ctx._mocks.sendPrivateEncrypted).toHaveBeenCalled();
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
  });

  it("does not check E2EE for group sessions", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    const session = makeSession({
      type: "group",
      targetId: "group_1",
    });
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(getLocalSessionStatusMock).not.toHaveBeenCalled();
    expect(ctx._mocks.sendGroup).toHaveBeenCalled();
  });

  it("encrypted offline payload does not contain plaintext content", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_data_only",
      header: { dhPubKey: "abc" },
      deviceId: "dev_1",
    });

    // Make the send call throw a network error to trigger offline payload storage
    ctx._mocks.sendPrivateEncrypted.mockRejectedValue(
      Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
    );

    const session = makeSession();
    const result = await sendMessage(session, "secret plaintext message", "TEXT");

    expect(result).toBe(false);

    const addCalls = ctx._mocks.addPendingMessage.mock.calls;
    expect(addCalls.length).toBe(1);
    const payload = addCalls[0][2];

    // Must be marked encrypted
    expect(payload.encrypted).toBe(true);
    expect(payload.data.encrypted).toBe(true);

    // Content must be ciphertext, not plaintext
    expect(payload.data.e2eeEnvelope.ciphertext).toBe("encrypted_data_only");
    expect(payload.data).not.toHaveProperty("content");
    expect(payload.data.content).not.toBe("secret plaintext message");

    // Must contain E2EE fields
    expect(payload.data.e2eeHeader).toBeTruthy();
    expect(payload.data.e2eeDeviceId).toBe("dev_1");

    // Must NOT contain media fields or other plaintext-leaking fields
    expect(payload.data).not.toHaveProperty("mediaUrl");
    expect(payload.data).not.toHaveProperty("mediaSize");
    expect(payload.data).not.toHaveProperty("mediaName");
    expect(payload.data).not.toHaveProperty("thumbnailUrl");
    expect(payload.data).not.toHaveProperty("duration");
    expect(payload.data).not.toHaveProperty("extra");
  });

  it("plaintext offline payload preserves original fields for non-encrypted send", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "plaintext");

    ctx._mocks.sendPrivate.mockRejectedValue(
      Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }),
    );

    const session = makeSession();
    const result = await sendMessage(session, "normal message", "TEXT");

    expect(result).toBe(false);

    const addCalls = ctx._mocks.addPendingMessage.mock.calls;
    expect(addCalls.length).toBe(1);
    const payload = addCalls[0][2];

    expect(payload.sendType).toBe("private");
    expect(payload.data.content).toBe("normal message");
    expect(payload.data).not.toHaveProperty("encrypted");
  });

  it("encryption failure does not create offline retry task", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    localStorage.setItem("e2ee:status:sess_1", "encrypted");
    encryptMessageMock.mockRejectedValue(new Error("ratchet corrupted"));

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.addPendingMessage).not.toHaveBeenCalled();
  });

  // E2/E8/E21: negotiating 状态必须阻断发送
  it("blocks send when session status is negotiating", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("negotiating");

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
      "端到端加密协商尚未完成，请等待对方确认。",
    );
  });

  // E21/E24: sendPrivateEncrypted payload 必须包含 encrypted=true, e2eeHeader, e2eeDeviceId
  it("sendPrivateEncrypted payload includes encrypted=true, e2eeHeader, e2eeDeviceId", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_data",
      header: { dhPubKey: "test_key", counter: 1, previousCounter: 0 },
      deviceId: "device_123",
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(ctx._mocks.sendPrivateEncrypted).toHaveBeenCalledTimes(1);

    const sentPayload = ctx._mocks.sendPrivateEncrypted.mock.calls[0][0];
    expect(sentPayload.encrypted).toBe(true);
    expect(sentPayload.e2eeHeader).toBe(
      JSON.stringify({ dhPubKey: "test_key", counter: 1, previousCounter: 0 }),
    );
    expect(sentPayload.e2eeDeviceId).toBe("device_123");
  });

  // E21: initial handshake 存在时必须携带 e2eeSenderIdentityKey/e2eeEphemeralKey
  it("includes e2eeSenderIdentityKey and e2eeEphemeralKey when initial handshake exists", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_data",
      header: { dhPubKey: "test_key" },
      deviceId: "device_123",
    });
    getPendingInitialHandshakeMock.mockReturnValue({
      senderIdentityKey: "sender_identity_key_base64",
      ephemeralPublicKey: "ephemeral_public_key_base64",
      deviceId: "device_123",
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    const sentPayload = ctx._mocks.sendPrivateEncrypted.mock.calls[0][0];
    expect(sentPayload.e2eeSenderIdentityKey).toBe(
      "sender_identity_key_base64",
    );
    expect(sentPayload.e2eeEphemeralKey).toBe("ephemeral_public_key_base64");
  });

  // E21/E28: server response 后本地 sender 仍保留 plaintext content 展示
  it("preserves local plaintext content for sender after server response", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_ciphertext",
      header: { dhPubKey: "key" },
      deviceId: "dev_1",
    });

    const session = makeSession();
    const result = await sendMessage(session, "my secret message", "TEXT");

    expect(result).toBe(true);

    // The addMessage call should have the original plaintext
    const addMessageCalls = ctx._mocks.addMessage.mock.calls;
    const originalPending = addMessageCalls[0][0];
    expect(originalPending.content).toBe("my secret message");

    // replaceLocalMessage should be called with server message that has plaintext content
    // The server message content should be overridden to show plaintext to sender
    expect(ctx._mocks.scheduleServerMessagePersist).toHaveBeenCalled();
    const persistedMessages =
      ctx._mocks.scheduleServerMessagePersist.mock.calls[0][1];
    expect(persistedMessages[0].content).toBe("my secret message");
  });

  // E28: clearPendingInitialHandshake 在首条加密发送成功后执行
  it("calls clearPendingInitialHandshake after first encrypted send succeeds", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_data",
      header: { dhPubKey: "key" },
      deviceId: "dev_1",
    });
    getPendingInitialHandshakeMock.mockReturnValue({
      senderIdentityKey: "identity_key",
      ephemeralPublicKey: "ephemeral_key",
      deviceId: "dev_1",
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(clearPendingInitialHandshakeMock).toHaveBeenCalledWith("sess_1");
  });

  // E8/E28: E2EE module load failed 时不得在已知 encrypted session 静默明文发送
  it("does not silently send plaintext when E2EE module load fails on encrypted session", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    // Simulate E2EE module load failure by making getLocalSessionStatus throw
    getLocalSessionStatusMock.mockImplementation(() => {
      throw new Error("Module not found");
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    // Should fail because we cannot determine encryption state
    // The catch block should not allow plaintext fallback for private sessions
    expect(result).toBe(false);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
  });

  // E24: encrypted session 下 encryptMessage 返回 null 时 pending 标记 FAILED
  it("marks pending as FAILED when encryptMessage returns null on encrypted session", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockResolvedValue(null);

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);

    // Verify the pending message is marked as FAILED
    const upsertCalls = ctx._mocks.upsertPendingMessage.mock.calls;
    const failedCall = upsertCalls.find(
      (call: unknown[]) =>
        (call[2] as Message | undefined)?.status === "FAILED",
    );
    expect(failedCall).toBeTruthy();
    expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
      "端到端加密失败，消息未发送",
    );
  });

  // E21: encrypted session 下必须调用 sendPrivateEncrypted (不调用 sendPrivate)
  it("must call sendPrivateEncrypted and not sendPrivate for encrypted session", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockResolvedValue({
      ciphertext: "encrypted_content",
      header: { dhPubKey: "key", counter: 0, previousCounter: 0 },
      deviceId: "dev_1",
    });

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(ctx._mocks.sendPrivateEncrypted).toHaveBeenCalledTimes(1);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
  });
});
