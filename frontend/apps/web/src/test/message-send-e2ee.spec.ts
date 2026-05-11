import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Message, ChatSession } from "@/types";

const encryptMessageMock = vi.fn();
const getLocalSessionStatusMock = vi.fn();
const getPendingInitialHandshakeMock = vi.fn((..._args: unknown[]) => null);
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
  });

  it("marks message FAILED and does not send when encrypted session and encryptMessage throws", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockRejectedValue(new Error("ratchet state corrupted"));

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.sendPrivate).not.toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(ctx._mocks.notifyWarning).toHaveBeenCalledWith(
      "端到端加密失败，消息未发送",
    );

    // pending message should be marked FAILED
    const upsertCalls = ctx._mocks.upsertPendingMessage.mock.calls;
    const failedCall = upsertCalls.find(
      (call: unknown[]) =>
        (call[2] as Message | undefined)?.status === "FAILED",
    );
    expect(failedCall).toBeTruthy();
  });

  it("marks message FAILED when encryptMessage returns null payload", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
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

    getLocalSessionStatusMock.mockReturnValue("encrypted");
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

    getLocalSessionStatusMock.mockReturnValue("plaintext");

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(true);
    expect(ctx._mocks.sendPrivate).toHaveBeenCalled();
    expect(ctx._mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
  });

  it("uses sendPrivateEncrypted when encryption succeeds", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    getLocalSessionStatusMock.mockReturnValue("encrypted");
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

    getLocalSessionStatusMock.mockReturnValue("encrypted");
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
    expect(payload.data.content).toBe("encrypted_data_only");
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

    getLocalSessionStatusMock.mockReturnValue("plaintext");

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

    getLocalSessionStatusMock.mockReturnValue("encrypted");
    encryptMessageMock.mockRejectedValue(new Error("ratchet corrupted"));

    const session = makeSession();
    const result = await sendMessage(session, "hello", "TEXT");

    expect(result).toBe(false);
    expect(ctx._mocks.addPendingMessage).not.toHaveBeenCalled();
  });
});
