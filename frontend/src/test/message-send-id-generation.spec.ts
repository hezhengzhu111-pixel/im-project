import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { Message, ChatSession } from "@/types";

const getLocalSessionStatusMock = vi.fn();

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    encryptMessage: vi.fn(),
  },
}));

vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: (...args: unknown[]) =>
    getLocalSessionStatusMock(...args),
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
      clientMessageId: "",
      senderId: "user_1",
      receiverId: "user_2",
      status: "SENT",
    },
  });
  const sendGroup = vi.fn().mockResolvedValue({
    data: {
      id: "srv_3",
      clientMessageId: "",
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
      sendPrivateEncrypted: sendPrivate,
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
      sendGroup,
      addMessage,
      upsertPendingMessage,
      removePendingMessage,
      addPendingMessage,
    },
  };
};

// Mirror of the generateUUID from message-send-queue.ts for direct testing
const generateUUID = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

describe("message-send-queue ID generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalSessionStatusMock.mockReturnValue("plaintext");
  });

  it("连续生成 10000 个 clientMessageId 无重复", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const id = `cm_${generateUUID()}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(10000);
  });

  it("连续生成 10000 个 localId 无重复", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const id = `local_${generateUUID()}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(10000);
  });

  it("clientMessageId 长度 <= 64", () => {
    const id = `cm_${generateUUID()}`;
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("localId 以 local_ 前缀开头，长度 42", () => {
    const id = `local_${generateUUID()}`;
    expect(id.startsWith("local_")).toBe(true);
    expect(id.length).toBe(42);
  });

  it("clientMessageId 以 cm_ 前缀开头，长度 39", () => {
    const id = `cm_${generateUUID()}`;
    expect(id.startsWith("cm_")).toBe(true);
    expect(id.length).toBe(39);
  });

  it("生成的 UUID 格式为有效 v4 UUID", () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (let i = 0; i < 100; i++) {
      expect(uuidPattern.test(generateUUID())).toBe(true);
    }
  });

  it("fallback 环境下仍能生成 ID（模拟无 crypto.randomUUID）", () => {
    const originalRandomUUID = crypto.randomUUID;
    vi.spyOn(crypto, "randomUUID").mockImplementation(undefined as never);

    const id1 = generateUUID();
    const id2 = generateUUID();

    expect(id1).not.toBe(id2);

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuidPattern.test(id1)).toBe(true);
    expect(uuidPattern.test(id2)).toBe(true);

    vi.restoreAllMocks();
    crypto.randomUUID = originalRandomUUID;
  });

  it("sendMessage 使用新格式 ID 生成", async () => {
    const ctx = makeCtx();
    const { sendMessage } = createMessageSendQueueModule(ctx as never);

    await sendMessage(makeSession(), "test", "TEXT");

    const msg = ctx._mocks.addMessage.mock.calls[0][0] as Message;

    expect(msg.id.startsWith("local_")).toBe(true);
    expect(msg.clientMessageId!.startsWith("cm_")).toBe(true);
    expect(msg.clientMessageId!.length).toBeLessThanOrEqual(64);

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuidPattern.test(msg.id.replace("local_", ""))).toBe(true);
    expect(uuidPattern.test(msg.clientMessageId!.replace("cm_", ""))).toBe(
      true,
    );
  });
});
