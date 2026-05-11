import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/normalizers/chat", () => ({
  safePreferExistingId: (server: string, local: string) => server || local,
}));

vi.mock("@/normalizers/message", () => ({
  normalizeMessage: (raw: unknown) => raw,
}));

import { retryPendingMessages } from "@/stores/modules/message-retry";

const makeMocks = () => {
  const sendPrivate = vi.fn().mockResolvedValue({ data: { id: "srv_1" } });
  const sendPrivateEncrypted = vi
    .fn()
    .mockResolvedValue({ data: { id: "srv_2" } });
  const sendGroup = vi.fn().mockResolvedValue({ data: { id: "srv_3" } });
  const listPendingMessages = vi.fn().mockResolvedValue([]);
  const removePendingMessage = vi.fn().mockResolvedValue(undefined);

  return {
    messageService: { sendPrivate, sendPrivateEncrypted, sendGroup },
    messageRepo: { listPendingMessages, removePendingMessage },
    mocks: {
      sendPrivate,
      sendPrivateEncrypted,
      sendGroup,
      listPendingMessages,
      removePendingMessage,
    },
  };
};

describe("retryPendingMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls sendPrivateEncrypted for encrypted pending messages", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();
    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_1",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          encrypted: true,
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            content: "encrypted_ciphertext",
            encrypted: true,
            e2eeHeader: '{"dhPubKey":"abc"}',
            e2eeDeviceId: "dev_1",
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivateEncrypted).toHaveBeenCalledWith({
      receiverId: "user_2",
      clientMessageId: "cm_1",
      messageType: "TEXT",
      content: "encrypted_ciphertext",
      encrypted: true,
      e2eeHeader: '{"dhPubKey":"abc"}',
      e2eeDeviceId: "dev_1",
    });
    expect(mocks.sendPrivate).not.toHaveBeenCalled();
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_1");
  });

  it("removes incomplete encrypted payload and does not send", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    // missing e2eeHeader
    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_bad_1",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          encrypted: true,
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            content: "some_ciphertext",
            encrypted: true,
            e2eeDeviceId: "dev_1",
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(mocks.sendPrivate).not.toHaveBeenCalled();
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_bad_1");
  });

  it("removes encrypted payload missing content and does not send", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_bad_2",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          encrypted: true,
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            encrypted: true,
            e2eeHeader: '{"dhPubKey":"abc"}',
            e2eeDeviceId: "dev_1",
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(mocks.sendPrivate).not.toHaveBeenCalled();
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_bad_2");
  });

  it("removes encrypted payload missing deviceId and does not send", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_bad_3",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          encrypted: true,
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            content: "some_ciphertext",
            encrypted: true,
            e2eeHeader: '{"dhPubKey":"abc"}',
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(mocks.sendPrivate).not.toHaveBeenCalled();
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_bad_3");
  });

  it("handles legacy payload with encrypted at top level", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    // Legacy format: encrypted at payload level, not inside data
    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_legacy",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          encrypted: true,
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            content: "legacy_ciphertext",
            encrypted: true,
            e2eeHeader: '{"dhPubKey":"xyz"}',
            e2eeDeviceId: "dev_2",
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivateEncrypted).toHaveBeenCalledWith(
      expect.objectContaining({ content: "legacy_ciphertext" }),
    );
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_legacy");
  });

  it("calls sendPrivate for plaintext pending messages", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_plain",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            content: "hello plaintext",
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivate).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello plaintext" }),
    );
    expect(mocks.sendPrivateEncrypted).not.toHaveBeenCalled();
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_plain");
  });

  it("calls sendGroup for group pending messages", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_group",
        conversationId: "group_1",
        payload: JSON.stringify({
          sendType: "group",
          data: {
            groupId: "group_1",
            clientMessageId: "cm_2",
            messageType: "TEXT",
            content: "group message",
          },
        }),
      },
    ]);

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendGroup).toHaveBeenCalledWith(
      expect.objectContaining({ content: "group message" }),
    );
    expect(mocks.sendPrivate).not.toHaveBeenCalled();
    expect(mocks.removePendingMessage).toHaveBeenCalledWith("local_group");
  });

  it("leaves failed entries in queue for next retry", async () => {
    const { messageService, messageRepo, mocks } = makeMocks();

    mocks.listPendingMessages.mockResolvedValue([
      {
        localId: "local_fail",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          data: {
            receiverId: "user_2",
            clientMessageId: "cm_1",
            messageType: "TEXT",
            content: "will fail",
          },
        }),
      },
    ]);
    mocks.sendPrivate.mockRejectedValue(new Error("network"));

    await retryPendingMessages(messageService, messageRepo);

    expect(mocks.sendPrivate).toHaveBeenCalled();
    expect(mocks.removePendingMessage).not.toHaveBeenCalled();
  });
});
