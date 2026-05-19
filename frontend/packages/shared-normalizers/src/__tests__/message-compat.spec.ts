import { describe, it, expect } from "vitest";
import {
  normalizeMessage,
  normalizeMessageSendTime,
  normalizeMessageStatus,
} from "../message.js";
import type { Message, RawMessageDTO } from "@im/shared-types";

/** Helper: minimal valid raw DTO for tests that only care about one field. */
const base = (overrides: Partial<RawMessageDTO> = {}): RawMessageDTO => ({
  id: "1",
  senderId: "u1",
  messageType: "TEXT",
  content: "hello",
  status: 1,
  sendTime: "2024-06-01T10:00:00.000Z",
  ...overrides,
});

// ─── 1. id / messageId / message_id ──────────────────────────────────────────

describe("message id field variants", () => {
  it("raw.id exists → Message.id correct", () => {
    const msg = normalizeMessage(base({ id: "100" }));
    expect(msg.id).toBe("100");
  });

  it("raw.messageId exists → Message.id correct (fallback)", () => {
    const msg = normalizeMessage(base({ id: undefined, messageId: "200" }));
    expect(msg.id).toBe("200");
  });

  it("raw.message_id exists → Message.id correct (snake_case fallback)", () => {
    const msg = normalizeMessage(
      base({ id: undefined, messageId: undefined, message_id: "300" }),
    );
    expect(msg.id).toBe("300");
  });

  it("raw.messageId exists → Message.messageId correct", () => {
    const msg = normalizeMessage(base({ messageId: "200" }));
    expect(msg.messageId).toBe("200");
  });

  it("raw.id only → Message.messageId is undefined", () => {
    const msg = normalizeMessage(base({ id: "100", messageId: undefined }));
    expect(msg.messageId).toBeUndefined();
  });

  it("raw.message_id (snake_case) maps to Message.messageId", () => {
    const msg = normalizeMessage(
      base({ id: undefined, messageId: undefined, message_id: "300" }),
    );
    expect(msg.messageId).toBe("300");
  });

  it("raw.messageId (camelCase) takes precedence over raw.message_id", () => {
    const msg = normalizeMessage(
      base({ messageId: "200", message_id: "300" }),
    );
    expect(msg.messageId).toBe("200");
  });

  it("all three id fields present: id, messageId, clientMessageId all preserved", () => {
    const msg = normalizeMessage(
      base({
        id: "100",
        messageId: "200",
        clientMessageId: "cm-100",
      }),
    );
    expect(msg.id).toBe("100");
    expect(msg.messageId).toBe("200");
    expect(msg.clientMessageId).toBe("cm-100");
  });

  it("snake_case message_id + client_message_id: both map correctly", () => {
    const msg = normalizeMessage(
      base({
        id: undefined,
        messageId: undefined,
        message_id: "srv-500",
        clientMessageId: undefined,
        client_message_id: "cm-500",
      }),
    );
    expect(msg.id).toBe("srv-500");
    expect(msg.messageId).toBe("srv-500");
    expect(msg.clientMessageId).toBe("cm-500");
  });
});

// ─── 2. clientMessageId / client_message_id ──────────────────────────────────

describe("clientMessageId field variants", () => {
  it("camelCase maps to Message.clientMessageId", () => {
    const msg = normalizeMessage(base({ clientMessageId: "cm-1" }));
    expect(msg.clientMessageId).toBe("cm-1");
  });

  it("snake_case maps to Message.clientMessageId", () => {
    const msg = normalizeMessage(base({ client_message_id: "cm-2" }));
    expect(msg.clientMessageId).toBe("cm-2");
  });

  it("camelCase takes precedence over snake_case", () => {
    const msg = normalizeMessage(
      base({ clientMessageId: "cm-camel", client_message_id: "cm-snake" }),
    );
    expect(msg.clientMessageId).toBe("cm-camel");
  });

  it("neither present → undefined", () => {
    const msg = normalizeMessage(base());
    expect(msg.clientMessageId).toBeUndefined();
  });
});

// ─── 3. senderId / sender_id / sender.id ─────────────────────────────────────

describe("senderId field variants", () => {
  it("camelCase senderId maps correctly", () => {
    const msg = normalizeMessage(base({ senderId: "s1" }));
    expect(msg.senderId).toBe("s1");
  });

  it("snake_case sender_id maps correctly", () => {
    const msg = normalizeMessage(base({ senderId: undefined, sender_id: "s2" }));
    expect(msg.senderId).toBe("s2");
  });

  it("nested sender.id maps correctly", () => {
    const msg = normalizeMessage(
      base({ senderId: undefined, sender_id: undefined, sender: { id: "s3" } }),
    );
    expect(msg.senderId).toBe("s3");
  });

  it("camelCase senderId takes precedence over sender_id", () => {
    const msg = normalizeMessage(base({ senderId: "s-camel", sender_id: "s-snake" }));
    expect(msg.senderId).toBe("s-camel");
  });

  it("sender.id takes precedence over sender_id", () => {
    const msg = normalizeMessage(
      base({ senderId: undefined, sender_id: "s-snake", sender: { id: "s-nested" } }),
    );
    expect(msg.senderId).toBe("s-nested");
  });

  it("sender nickname/username/avatar are mapped", () => {
    const msg = normalizeMessage(
      base({
        sender: { id: "s1", nickname: "Nick", username: "user1", avatar: "av.png" },
        senderName: undefined,
        senderAvatar: undefined,
      }),
    );
    expect(msg.senderName).toBe("Nick");
    expect(msg.senderAvatar).toBe("av.png");
  });

  it("senderName takes precedence over sender.nickname", () => {
    const msg = normalizeMessage(
      base({
        senderName: "Direct",
        sender: { id: "s1", nickname: "Nested" },
      }),
    );
    expect(msg.senderName).toBe("Direct");
  });
});

// ─── 4. receiverId / receiver_id / receiver.id ───────────────────────────────

describe("receiverId field variants", () => {
  it("camelCase receiverId maps correctly", () => {
    const msg = normalizeMessage(base({ receiverId: "r1" }));
    expect(msg.receiverId).toBe("r1");
  });

  it("snake_case receiver_id maps correctly", () => {
    const msg = normalizeMessage(
      base({ receiverId: undefined, receiver_id: "r2" }),
    );
    expect(msg.receiverId).toBe("r2");
  });

  it("nested receiver.id maps correctly", () => {
    const msg = normalizeMessage(
      base({
        receiverId: undefined,
        receiver_id: undefined,
        receiver: { id: "r3" },
      }),
    );
    expect(msg.receiverId).toBe("r3");
  });

  it("camelCase takes precedence over snake_case", () => {
    const msg = normalizeMessage(
      base({ receiverId: "r-camel", receiver_id: "r-snake" }),
    );
    expect(msg.receiverId).toBe("r-camel");
  });

  it("receiver nickname/username/avatar are mapped", () => {
    const msg = normalizeMessage(
      base({
        receiver: { id: "r1", nickname: "RN", username: "ruser", avatar: "rav.png" },
        receiverName: undefined,
        receiverAvatar: undefined,
      }),
    );
    expect(msg.receiverName).toBe("RN");
    expect(msg.receiverAvatar).toBe("rav.png");
  });

  it("receiverName takes precedence over receiver.nickname", () => {
    const msg = normalizeMessage(
      base({
        receiverName: "DirectR",
        receiver: { id: "r1", nickname: "NestedR" },
      }),
    );
    expect(msg.receiverName).toBe("DirectR");
  });
});

// ─── 5. groupId / group_id / group.id ────────────────────────────────────────

describe("groupId field variants", () => {
  it("camelCase groupId maps correctly", () => {
    const msg = normalizeMessage(base({ groupId: "g1" }));
    expect(msg.groupId).toBe("g1");
    expect(msg.isGroupChat).toBe(true);
  });

  it("snake_case group_id maps correctly", () => {
    const msg = normalizeMessage(base({ groupId: undefined, group_id: "g2" }));
    expect(msg.groupId).toBe("g2");
    expect(msg.isGroupChat).toBe(true);
  });

  it("nested group.id maps correctly", () => {
    const msg = normalizeMessage(
      base({ groupId: undefined, group_id: undefined, group: { id: "g3" } }),
    );
    expect(msg.groupId).toBe("g3");
    expect(msg.isGroupChat).toBe(true);
  });

  it("camelCase takes precedence over snake_case", () => {
    const msg = normalizeMessage(
      base({ groupId: "g-camel", group_id: "g-snake" }),
    );
    expect(msg.groupId).toBe("g-camel");
  });

  it("no groupId → isGroupChat false", () => {
    const msg = normalizeMessage(base({ groupId: undefined }));
    expect(msg.isGroupChat).toBe(false);
  });

  it("explicit isGroupChat=false overrides groupId inference", () => {
    const msg = normalizeMessage(base({ isGroupChat: false, groupId: "g1" }));
    // ?? only falls through on null/undefined, not false
    expect(msg.isGroupChat).toBe(false);
  });

  it("isGroupMessage flag maps to isGroupChat", () => {
    const msg = normalizeMessage(
      base({ isGroupChat: undefined, isGroupMessage: true }),
    );
    expect(msg.isGroupChat).toBe(true);
  });

  it("isGroup flag maps to isGroupChat", () => {
    const msg = normalizeMessage(
      base({ isGroupChat: undefined, isGroupMessage: undefined, isGroup: true }),
    );
    expect(msg.isGroupChat).toBe(true);
  });

  it("empty string groupId → isGroupChat false", () => {
    const msg = normalizeMessage(base({ groupId: "" }));
    expect(msg.isGroupChat).toBe(false);
  });
});

// ─── 6. Time fields (priority + fractional seconds) ──────────────────────────

describe("time field variants", () => {
  it("created_at has highest priority", () => {
    const msg = normalizeMessage(
      base({
        created_at: "2025-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        createdTime: "2023-01-01T00:00:00.000Z",
        created_time: "2022-01-01T00:00:00.000Z",
        sendTime: "2021-01-01T00:00:00.000Z",
        send_time: "2020-01-01T00:00:00.000Z",
      }),
    );
    expect(msg.sendTime).toBe("2025-01-01T00:00:00.000Z");
  });

  it("createdAt is second priority", () => {
    const msg = normalizeMessage(
      base({
        createdAt: "2024-06-15T12:00:00.000Z",
        createdTime: "2023-01-01T00:00:00.000Z",
        sendTime: "2021-01-01T00:00:00.000Z",
      }),
    );
    expect(msg.sendTime).toBe("2024-06-15T12:00:00.000Z");
  });

  it("createdTime is third priority", () => {
    const msg = normalizeMessage(
      base({
        createdTime: "2023-03-03T00:00:00.000Z",
        sendTime: "2021-01-01T00:00:00.000Z",
      }),
    );
    expect(msg.sendTime).toBe("2023-03-03T00:00:00.000Z");
  });

  it("created_time is fourth priority", () => {
    const msg = normalizeMessage(
      base({
        created_time: "2022-02-02T00:00:00.000Z",
        sendTime: "2021-01-01T00:00:00.000Z",
      }),
    );
    expect(msg.sendTime).toBe("2022-02-02T00:00:00.000Z");
  });

  it("sendTime is fifth priority", () => {
    const msg = normalizeMessage(base({ sendTime: "2021-05-05T00:00:00.000Z" }));
    expect(msg.sendTime).toBe("2021-05-05T00:00:00.000Z");
  });

  it("send_time is sixth priority", () => {
    const msg = normalizeMessage(
      base({ sendTime: undefined, send_time: "2020-06-06T00:00:00.000Z" }),
    );
    expect(msg.sendTime).toBe("2020-06-06T00:00:00.000Z");
  });

  it("overlong fractional seconds trimmed to milliseconds", () => {
    const msg = normalizeMessage(
      base({ created_at: "2024-01-15T08:30:45.123456789Z" }),
    );
    expect(msg.sendTime).toBe("2024-01-15T08:30:45.123Z");
  });

  it("3-digit fractional seconds preserved", () => {
    const msg = normalizeMessage(
      base({ created_at: "2024-01-15T08:30:45.456Z" }),
    );
    expect(msg.sendTime).toBe("2024-01-15T08:30:45.456Z");
  });

  it("no fractional seconds → unchanged", () => {
    const msg = normalizeMessage(
      base({ created_at: "2024-01-15T08:30:45Z" }),
    );
    expect(msg.sendTime).toBe("2024-01-15T08:30:45Z");
  });

  it("fallback used when no time fields present", () => {
    const raw: RawMessageDTO = { id: "1", senderId: "u1", messageType: "TEXT", content: "x", status: 1 };
    const fallback = "2030-01-01T00:00:00.000Z";
    const msg = normalizeMessage(raw, fallback);
    expect(msg.sendTime).toBe(fallback);
  });

  it("normalizeMessageSendTime respects priority order", () => {
    const raw: RawMessageDTO = {
      sendTime: "2021-01-01T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(normalizeMessageSendTime(raw)).toBe("2024-01-01T00:00:00.000Z");
  });
});

// ─── 7. mediaUrl / media_url / extra.url ─────────────────────────────────────

describe("mediaUrl field variants", () => {
  it("camelCase mediaUrl maps correctly", () => {
    const msg = normalizeMessage(base({ messageType: "IMAGE", mediaUrl: "https://img/a.jpg" }));
    expect(msg.mediaUrl).toBe("https://img/a.jpg");
  });

  it("snake_case media_url maps correctly", () => {
    const msg = normalizeMessage(
      base({ messageType: "IMAGE", mediaUrl: undefined, media_url: "https://img/b.jpg" }),
    );
    expect(msg.mediaUrl).toBe("https://img/b.jpg");
  });

  it("extra.url maps correctly for IMAGE", () => {
    const msg = normalizeMessage(
      base({
        messageType: "IMAGE",
        mediaUrl: undefined,
        media_url: undefined,
        extra: { url: "https://img/c.jpg" },
      }),
    );
    expect(msg.mediaUrl).toBe("https://img/c.jpg");
  });

  it("camelCase mediaUrl takes precedence over media_url", () => {
    const msg = normalizeMessage(
      base({
        messageType: "IMAGE",
        mediaUrl: "https://camel",
        media_url: "https://snake",
      }),
    );
    expect(msg.mediaUrl).toBe("https://camel");
  });

  it("content used as fallback for non-TEXT non-SYSTEM types", () => {
    const msg = normalizeMessage(
      base({
        messageType: "IMAGE",
        content: "https://fallback/img.png",
        mediaUrl: undefined,
        media_url: undefined,
      }),
    );
    expect(msg.mediaUrl).toBe("https://fallback/img.png");
  });

  it("TEXT message with no mediaUrl → undefined", () => {
    const msg = normalizeMessage(base({ messageType: "TEXT" }));
    expect(msg.mediaUrl).toBeUndefined();
  });
});

// ─── 8. mediaName / media_name / extra.fileName / extra.originalFilename ─────

describe("mediaName field variants", () => {
  it("camelCase mediaName maps correctly", () => {
    const msg = normalizeMessage(base({ mediaName: "doc.pdf" }));
    expect(msg.mediaName).toBe("doc.pdf");
  });

  it("snake_case media_name maps correctly", () => {
    const msg = normalizeMessage(
      base({ mediaName: undefined, media_name: "doc2.pdf" }),
    );
    expect(msg.mediaName).toBe("doc2.pdf");
  });

  it("extra.fileName maps correctly", () => {
    const msg = normalizeMessage(
      base({
        mediaName: undefined,
        media_name: undefined,
        extra: { fileName: "extra.pdf" },
      }),
    );
    expect(msg.mediaName).toBe("extra.pdf");
  });

  it("extra.originalFilename maps correctly", () => {
    const msg = normalizeMessage(
      base({
        mediaName: undefined,
        media_name: undefined,
        extra: { originalFilename: "original.pdf" },
      }),
    );
    expect(msg.mediaName).toBe("original.pdf");
  });

  it("camelCase takes highest precedence", () => {
    const msg = normalizeMessage(
      base({
        mediaName: "camel",
        media_name: "snake",
        extra: { fileName: "extra" },
      }),
    );
    expect(msg.mediaName).toBe("camel");
  });
});

// ─── 9. Status (numeric + string) ────────────────────────────────────────────

describe("status field", () => {
  it.each([
    [1, "SENT"],
    [2, "DELIVERED"],
    [3, "READ"],
    [4, "RECALLED"],
    [5, "DELETED"],
  ] as const)("numeric %d → %s", (input, expected) => {
    expect(normalizeMessageStatus(input)).toBe(expected);
  });

  it.each([
    ["SENDING", "SENDING"],
    ["SENT", "SENT"],
    ["DELIVERED", "DELIVERED"],
    ["READ", "READ"],
    ["FAILED", "FAILED"],
    ["OFFLINE", "OFFLINE"],
    ["RECALLED", "RECALLED"],
    ["DELETED", "DELETED"],
  ] as const)("string '%s' → %s", (input, expected) => {
    expect(normalizeMessageStatus(input)).toBe(expected);
  });

  it("lowercase string 'failed' → FAILED", () => {
    expect(normalizeMessageStatus("failed")).toBe("FAILED");
  });

  it("lowercase string 'offline' → OFFLINE", () => {
    expect(normalizeMessageStatus("offline")).toBe("OFFLINE");
  });

  it("lowercase string 'read' → READ", () => {
    expect(normalizeMessageStatus("read")).toBe("READ");
  });

  it("string numeric '3' → READ", () => {
    expect(normalizeMessageStatus("3")).toBe("READ");
  });

  it("unknown numeric → SENT fallback", () => {
    expect(normalizeMessageStatus(99)).toBe("SENT");
  });

  it("unknown string → SENT fallback", () => {
    expect(normalizeMessageStatus("UNKNOWN")).toBe("SENT");
  });

  it("null/undefined → SENT fallback", () => {
    expect(normalizeMessageStatus(null)).toBe("SENT");
    expect(normalizeMessageStatus(undefined)).toBe("SENT");
  });

  it("status from normalizeMessage raw DTO (numeric)", () => {
    const msg = normalizeMessage(base({ status: 3 }));
    expect(msg.status).toBe("READ");
  });

  it("status from normalizeMessage raw DTO (string)", () => {
    const msg = normalizeMessage(base({ status: "RECALLED" }));
    expect(msg.status).toBe("RECALLED");
  });
});

// ─── 10. readBy / readByCount / read_by_count / readAt / read_at ─────────────

describe("read fields", () => {
  it("readBy array maps correctly", () => {
    const msg = normalizeMessage(base({ readBy: ["u1", "u2", "u3"] }));
    expect(msg.readBy).toEqual(["u1", "u2", "u3"]);
  });

  it("readBy filters empty strings", () => {
    const msg = normalizeMessage(base({ readBy: ["u1", "", "u3"] }));
    expect(msg.readBy).toEqual(["u1", "u3"]);
  });

  it("readBy with number items converts to string", () => {
    const msg = normalizeMessage(base({ readBy: [100, 200] as unknown as string[] }));
    expect(msg.readBy).toEqual(["100", "200"]);
  });

  it("readBy non-array → undefined", () => {
    const msg = normalizeMessage(base({ readBy: "not-array" as unknown as string[] }));
    expect(msg.readBy).toBeUndefined();
  });

  it("camelCase readByCount maps correctly", () => {
    const msg = normalizeMessage(base({ readByCount: 5 }));
    expect(msg.readByCount).toBe(5);
  });

  it("snake_case read_by_count maps correctly", () => {
    const msg = normalizeMessage(
      base({ readByCount: undefined, read_by_count: 3 }),
    );
    expect(msg.readByCount).toBe(3);
  });

  it("camelCase readByCount takes precedence over read_by_count", () => {
    const msg = normalizeMessage(
      base({ readByCount: 10, read_by_count: 3 }),
    );
    expect(msg.readByCount).toBe(10);
  });

  it("camelCase readAt maps correctly", () => {
    const msg = normalizeMessage(base({ readAt: "2024-06-01T12:00:00.000Z" }));
    expect(msg.readAt).toBe("2024-06-01T12:00:00.000Z");
  });

  it("snake_case read_at maps correctly", () => {
    const msg = normalizeMessage(
      base({ readAt: undefined, read_at: "2024-06-02T12:00:00.000Z" }),
    );
    expect(msg.readAt).toBe("2024-06-02T12:00:00.000Z");
  });

  it("readAt fractional seconds trimmed", () => {
    const msg = normalizeMessage(
      base({ readAt: "2024-06-01T12:00:00.987654321Z" }),
    );
    expect(msg.readAt).toBe("2024-06-01T12:00:00.987Z");
  });

  it("readStatus maps correctly", () => {
    const msg = normalizeMessage(base({ readStatus: 2 }));
    expect(msg.readStatus).toBe(2);
  });

  it("readStatus string numeric maps correctly", () => {
    const msg = normalizeMessage(base({ readStatus: "3" as unknown as number }));
    expect(msg.readStatus).toBe(3);
  });
});

// ─── 11. E2EE fields ─────────────────────────────────────────────────────────

describe("E2EE fields", () => {
  it("encrypted boolean true maps correctly", () => {
    const msg = normalizeMessage(base({ encrypted: true }));
    expect(msg.encrypted).toBe(true);
  });

  it("encrypted numeric 1 maps to true", () => {
    const msg = normalizeMessage(base({ encrypted: 1 }));
    expect(msg.encrypted).toBe(true);
  });

  it("encrypted numeric 0 maps to false", () => {
    const msg = normalizeMessage(base({ encrypted: 0 }));
    expect(msg.encrypted).toBe(false);
  });

  it("encrypted undefined maps to false", () => {
    const msg = normalizeMessage(base({ encrypted: undefined }));
    expect(msg.encrypted).toBe(false);
  });

  it("legacy E2EE header fields are ignored", () => {
    const msg = normalizeMessage(
      base({ e2eeHeader: "header-data", e2ee_header: "header-snake" }),
    );
    const raw = msg as Record<string, unknown>;
    expect(raw.e2eeHeader).toBeUndefined();
    expect(raw.e2ee_header).toBeUndefined();
  });

  it("camelCase e2eeDeviceId maps correctly", () => {
    const msg = normalizeMessage(base({ e2eeDeviceId: "dev-1" }));
    expect(msg.e2eeDeviceId).toBe("dev-1");
  });

  it("snake_case e2ee_device_id maps correctly", () => {
    const msg = normalizeMessage(
      base({ e2eeDeviceId: undefined, e2ee_device_id: "dev-2" }),
    );
    expect(msg.e2eeDeviceId).toBe("dev-2");
  });

  it("legacy identity and ephemeral fields are ignored", () => {
    const msg = normalizeMessage(
      base({
        e2eeSenderIdentityKey: "ik-1",
        e2ee_sender_identity_key: "ik-2",
        e2eeEphemeralKey: "ek-1",
        e2ee_ephemeral_key: "ek-2",
      }),
    );
    const raw = msg as Record<string, unknown>;
    expect(raw.e2eeSenderIdentityKey).toBeUndefined();
    expect(raw.e2ee_sender_identity_key).toBeUndefined();
    expect(raw.e2eeEphemeralKey).toBeUndefined();
    expect(raw.e2ee_ephemeral_key).toBeUndefined();
  });

  it("Rust v2 e2eeEnvelope maps correctly", () => {
    const envelope = {
      version: 2,
      algorithm: "rust-x25519-x3dh-dr-v1",
      senderDeviceId: "mobile-sender",
      recipientDeviceId: "web-recipient",
      sessionId: "1_2",
      handshake: "aGFuZHNoYWtl",
      wire: "d2lyZQ==",
    };
    const msg = normalizeMessage(base({ e2eeEnvelope: envelope }));
    expect(msg.e2eeEnvelope).toEqual(envelope);
  });

  it("snake_case e2ee_envelope with alg normalizes to algorithm", () => {
    const msg = normalizeMessage(
      base({
        e2ee_envelope: {
          version: 2,
          alg: "rust-x25519-x3dh-dr-v1",
          senderDeviceId: "mobile-sender",
          recipientDeviceId: "web-recipient",
          sessionId: "1_2",
          wire: "d2lyZQ==",
        } as unknown as RawMessageDTO["e2ee_envelope"],
      }),
    );
    expect(msg.e2eeEnvelope).toEqual({
      version: 2,
      algorithm: "rust-x25519-x3dh-dr-v1",
      senderDeviceId: "mobile-sender",
      recipientDeviceId: "web-recipient",
      sessionId: "1_2",
      handshake: undefined,
      wire: "d2lyZQ==",
    });
  });

  it("all E2EE fields undefined when not provided", () => {
    const msg = normalizeMessage(base());
    const raw = msg as Record<string, unknown>;
    expect(raw.e2eeHeader).toBeUndefined();
    expect(msg.e2eeDeviceId).toBeUndefined();
    expect(msg.e2eeEnvelope).toBeUndefined();
    expect(raw.e2eeSenderIdentityKey).toBeUndefined();
    expect(raw.e2eeEphemeralKey).toBeUndefined();
  });
});

// ─── 12. AI fields ───────────────────────────────────────────────────────────

describe("AI fields", () => {
  it("camelCase isAiGenerated maps correctly", () => {
    const msg = normalizeMessage(base({ isAiGenerated: true }));
    expect(msg.isAiGenerated).toBe(true);
  });

  it("snake_case is_ai_generated maps correctly", () => {
    const msg = normalizeMessage(
      base({ isAiGenerated: undefined, is_ai_generated: true }),
    );
    expect(msg.isAiGenerated).toBe(true);
  });

  it("is_ai_generated false → false", () => {
    const msg = normalizeMessage(base({ is_ai_generated: false }));
    expect(msg.isAiGenerated).toBe(false);
  });

  it("camelCase aiProvider maps correctly", () => {
    const msg = normalizeMessage(base({ aiProvider: "deepseek" }));
    expect(msg.aiProvider).toBe("deepseek");
  });

  it("snake_case ai_provider maps correctly", () => {
    const msg = normalizeMessage(
      base({ aiProvider: undefined, ai_provider: "openai" }),
    );
    expect(msg.aiProvider).toBe("openai");
  });

  it("camelCase aiModel maps correctly", () => {
    const msg = normalizeMessage(base({ aiModel: "gpt-4o" }));
    expect(msg.aiModel).toBe("gpt-4o");
  });

  it("snake_case ai_model maps correctly", () => {
    const msg = normalizeMessage(
      base({ aiModel: undefined, ai_model: "deepseek-chat" }),
    );
    expect(msg.aiModel).toBe("deepseek-chat");
  });

  it("all AI fields undefined when not provided", () => {
    const msg = normalizeMessage(base());
    expect(msg.isAiGenerated).toBe(false);
    expect(msg.aiProvider).toBeUndefined();
    expect(msg.aiModel).toBeUndefined();
  });

  it("AI fields combined with AI_REPLY message type", () => {
    const msg = normalizeMessage(
      base({
        messageType: "AI_REPLY",
        is_ai_generated: true,
        ai_provider: "deepseek",
        ai_model: "deepseek-chat",
      }),
    );
    expect(msg.messageType).toBe("AI_REPLY");
    expect(msg.isAiGenerated).toBe(true);
    expect(msg.aiProvider).toBe("deepseek");
    expect(msg.aiModel).toBe("deepseek-chat");
  });
});

// ─── Additional: mediaSize / media_size / extra.size ─────────────────────────

describe("mediaSize field variants", () => {
  it("camelCase mediaSize maps correctly", () => {
    const msg = normalizeMessage(base({ mediaSize: 1024 }));
    expect(msg.mediaSize).toBe(1024);
  });

  it("snake_case media_size maps correctly", () => {
    const msg = normalizeMessage(
      base({ mediaSize: undefined, media_size: 2048 }),
    );
    expect(msg.mediaSize).toBe(2048);
  });

  it("string media_size parses to number", () => {
    const msg = normalizeMessage(
      base({ mediaSize: undefined, media_size: "4096" as unknown as number }),
    );
    expect(msg.mediaSize).toBe(4096);
  });

  it("extra.size maps correctly", () => {
    const msg = normalizeMessage(
      base({
        mediaSize: undefined,
        media_size: undefined,
        extra: { size: 8192 },
      }),
    );
    expect(msg.mediaSize).toBe(8192);
  });
});

// ─── Additional: thumbnailUrl / thumbnail_url / extra variants ───────────────

describe("thumbnailUrl field variants", () => {
  it("camelCase thumbnailUrl maps correctly", () => {
    const msg = normalizeMessage(base({ thumbnailUrl: "https://thumb/a" }));
    expect(msg.thumbnailUrl).toBe("https://thumb/a");
  });

  it("snake_case thumbnail_url maps correctly", () => {
    const msg = normalizeMessage(
      base({ thumbnailUrl: undefined, thumbnail_url: "https://thumb/b" }),
    );
    expect(msg.thumbnailUrl).toBe("https://thumb/b");
  });

  it("extra.thumbnailUrl maps correctly", () => {
    const msg = normalizeMessage(
      base({
        thumbnailUrl: undefined,
        thumbnail_url: undefined,
        extra: { thumbnailUrl: "https://thumb/c" },
      }),
    );
    expect(msg.thumbnailUrl).toBe("https://thumb/c");
  });
});

// ─── Additional: conversationSeq / conversation_seq ──────────────────────────

describe("conversationSeq field variants", () => {
  it("camelCase conversationSeq maps correctly", () => {
    const msg = normalizeMessage(base({ conversationSeq: 42 }));
    expect(msg.conversationSeq).toBe(42);
  });

  it("snake_case conversation_seq maps correctly", () => {
    const msg = normalizeMessage(
      base({ conversationSeq: undefined, conversation_seq: 99 }),
    );
    expect(msg.conversationSeq).toBe(99);
  });

  it("string conversation_seq parses to number", () => {
    const msg = normalizeMessage(
      base({
        conversationSeq: undefined,
        conversation_seq: "77" as unknown as number,
      }),
    );
    expect(msg.conversationSeq).toBe(77);
  });
});

// ─── Additional: duration from extra ─────────────────────────────────────────

describe("duration field variants", () => {
  it("top-level duration maps correctly", () => {
    const msg = normalizeMessage(base({ duration: 30 }));
    expect(msg.duration).toBe(30);
  });

  it("extra.duration maps correctly", () => {
    const msg = normalizeMessage(base({ duration: undefined, extra: { duration: 60 } }));
    expect(msg.duration).toBe(60);
  });
});

// ─── Additional: content handling ─────────────────────────────────────────────

describe("content handling", () => {
  it("string content preserved", () => {
    const msg = normalizeMessage(base({ content: "hello world" }));
    expect(msg.content).toBe("hello world");
  });

  it("non-string content → empty string", () => {
    const msg = normalizeMessage(base({ content: 123 as unknown as string }));
    expect(msg.content).toBe("");
  });

  it("null content → empty string", () => {
    const msg = normalizeMessage(base({ content: null as unknown as string }));
    expect(msg.content).toBe("");
  });

  it("undefined content → empty string", () => {
    const msg = normalizeMessage(base({ content: undefined }));
    expect(msg.content).toBe("");
  });
});

// ─── Additional: extra object passthrough ─────────────────────────────────────

describe("extra field", () => {
  it("extra object preserved when present", () => {
    const extraData = { url: "https://x", fileName: "f.txt", custom: 42 };
    const msg = normalizeMessage(base({ extra: extraData }));
    expect(msg.extra).toEqual(extraData);
  });

  it("non-record extra → undefined", () => {
    const msg = normalizeMessage(base({ extra: "not-record" as unknown as Record<string, unknown> }));
    expect(msg.extra).toBeUndefined();
  });
});

// ─── Integration: full snake_case DTO ────────────────────────────────────────

describe("full snake_case DTO integration", () => {
  it("normalizes a complete snake_case backend DTO", () => {
    const envelope = {
      version: 2,
      alg: "rust-x25519-x3dh-dr-v1",
      senderDeviceId: "ed",
      recipientDeviceId: "rd",
      sessionId: "sender-1_receiver-1",
      wire: "d2lyZQ==",
    };
    const raw: RawMessageDTO = {
      id: "999",
      message_id: "999",
      client_message_id: "cm-999",
      sender_id: "sender-1",
      sender: { id: "sender-1", nickname: "SenderNick", avatar: "s-av.png" },
      receiver_id: "receiver-1",
      receiver: { id: "receiver-1", nickname: "ReceiverNick", avatar: "r-av.png" },
      group_id: "group-1",
      conversation_seq: 50,
      isGroupMessage: true,
      messageType: "IMAGE",
      content: "photo content",
      media_url: "https://img/photo.jpg",
      media_size: 1024000,
      media_name: "photo.jpg",
      thumbnail_url: "https://img/thumb.jpg",
      duration: undefined,
      created_at: "2024-12-25T08:30:00.123456789Z",
      status: 3,
      extra: { custom: "data" },
      readBy: ["u1", "u2"],
      read_by_count: 2,
      read_at: "2024-12-25T09:00:00.000Z",
      is_ai_generated: false,
      encrypted: 1,
      e2ee_device_id: "ed",
      e2ee_envelope: envelope as unknown as RawMessageDTO["e2ee_envelope"],
    };
    const msg = normalizeMessage(raw);

    expect(msg.id).toBe("999");
    expect(msg.clientMessageId).toBe("cm-999");
    expect(msg.senderId).toBe("sender-1");
    expect(msg.senderName).toBe("SenderNick");
    expect(msg.senderAvatar).toBe("s-av.png");
    expect(msg.receiverId).toBe("receiver-1");
    expect(msg.receiverName).toBe("ReceiverNick");
    expect(msg.receiverAvatar).toBe("r-av.png");
    expect(msg.groupId).toBe("group-1");
    expect(msg.conversationSeq).toBe(50);
    expect(msg.isGroupChat).toBe(true);
    expect(msg.messageType).toBe("IMAGE");
    expect(msg.content).toBe("photo content");
    expect(msg.mediaUrl).toBe("https://img/photo.jpg");
    expect(msg.mediaSize).toBe(1024000);
    expect(msg.mediaName).toBe("photo.jpg");
    expect(msg.thumbnailUrl).toBe("https://img/thumb.jpg");
    expect(msg.sendTime).toBe("2024-12-25T08:30:00.123Z");
    expect(msg.status).toBe("READ");
    expect(msg.extra).toEqual({ custom: "data" });
    expect(msg.readBy).toEqual(["u1", "u2"]);
    expect(msg.readByCount).toBe(2);
    expect(msg.readAt).toBe("2024-12-25T09:00:00.000Z");
    expect(msg.isAiGenerated).toBe(false);
    expect(msg.encrypted).toBe(true);
    expect(msg.e2eeDeviceId).toBe("ed");
    expect(msg.e2eeEnvelope).toEqual({
      version: 2,
      algorithm: "rust-x25519-x3dh-dr-v1",
      senderDeviceId: "ed",
      recipientDeviceId: "rd",
      sessionId: "sender-1_receiver-1",
      handshake: undefined,
      wire: "d2lyZQ==",
    });
    expect((msg as Record<string, unknown>).e2eeHeader).toBeUndefined();
  });
});

// ─── Edge cases: null/undefined/non-object input ──────────────────────────────

// ─── 13. shared Message type constraint: no serverId ─────────────────────────

describe("shared Message type constraint", () => {
  it("normalized message does not contain serverId field", () => {
    const msg = normalizeMessage(base({ id: "100", messageId: "100" }));
    // @ts-expect-error serverId must not exist on shared Message
    expect((msg as Record<string, unknown>).serverId).toBeUndefined();
  });
});

describe("edge cases", () => {
  it("null input → safe defaults", () => {
    const msg = normalizeMessage(null);
    expect(msg.id).toBe("");
    expect(msg.senderId).toBe("");
    expect(msg.content).toBe("");
    expect(msg.messageType).toBe("TEXT");
    expect(msg.status).toBe("SENT");
    expect(msg.isGroupChat).toBe(false);
  });

  it("undefined input → safe defaults", () => {
    const msg = normalizeMessage(undefined);
    expect(msg.id).toBe("");
    expect(msg.senderId).toBe("");
  });

  it("string input → safe defaults", () => {
    const msg = normalizeMessage("not-an-object" as unknown as RawMessageDTO);
    expect(msg.id).toBe("");
    expect(msg.senderId).toBe("");
  });

  it("number input → safe defaults", () => {
    const msg = normalizeMessage(42 as unknown as RawMessageDTO);
    expect(msg.id).toBe("");
    expect(msg.senderId).toBe("");
  });

  it("empty object → safe defaults", () => {
    const msg = normalizeMessage({});
    expect(msg.id).toBe("");
    expect(msg.senderId).toBe("");
    expect(msg.content).toBe("");
    expect(msg.messageType).toBe("TEXT");
    expect(msg.status).toBe("SENT");
  });
});
