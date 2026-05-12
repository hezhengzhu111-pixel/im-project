import { describe, it, expect } from "vitest";
import {
  normalizeMessage,
  normalizeMessageType,
  normalizeMessageStatus,
  normalizeConversation,
  normalizeUser,
  normalizeGroup,
} from "../index.js";

describe("normalizeMessageType", () => {
  it("returns TEXT for known type", () => {
    expect(normalizeMessageType("TEXT")).toBe("TEXT");
  });

  it("returns IMAGE for known type", () => {
    expect(normalizeMessageType("IMAGE")).toBe("IMAGE");
  });

  it("returns FILE for known type", () => {
    expect(normalizeMessageType("FILE")).toBe("FILE");
  });

  it("returns VIDEO for known type", () => {
    expect(normalizeMessageType("VIDEO")).toBe("VIDEO");
  });

  it("returns VOICE for known type", () => {
    expect(normalizeMessageType("VOICE")).toBe("VOICE");
  });

  it("returns SYSTEM for known type", () => {
    expect(normalizeMessageType("SYSTEM")).toBe("SYSTEM");
  });

  it("returns AI_REPLY for known type", () => {
    expect(normalizeMessageType("AI_REPLY")).toBe("AI_REPLY");
  });

  it("normalizes lowercase input to uppercase", () => {
    expect(normalizeMessageType("text")).toBe("TEXT");
    expect(normalizeMessageType("image")).toBe("IMAGE");
  });

  it("falls back to TEXT for unknown type", () => {
    expect(normalizeMessageType("UNKNOWN")).toBe("TEXT");
    expect(normalizeMessageType("")).toBe("TEXT");
    expect(normalizeMessageType(null)).toBe("TEXT");
    expect(normalizeMessageType(undefined)).toBe("TEXT");
    expect(normalizeMessageType(123)).toBe("TEXT");
  });
});

describe("normalizeMessageStatus", () => {
  it("maps numeric status 1 to SENT", () => {
    expect(normalizeMessageStatus(1)).toBe("SENT");
  });

  it("maps numeric status 2 to DELIVERED", () => {
    expect(normalizeMessageStatus(2)).toBe("DELIVERED");
  });

  it("maps numeric status 3 to READ", () => {
    expect(normalizeMessageStatus(3)).toBe("READ");
  });

  it("maps numeric status 4 to RECALLED", () => {
    expect(normalizeMessageStatus(4)).toBe("RECALLED");
  });

  it("maps numeric status 5 to DELETED", () => {
    expect(normalizeMessageStatus(5)).toBe("DELETED");
  });

  it("falls back to SENT for unknown numeric status", () => {
    expect(normalizeMessageStatus(99)).toBe("SENT");
    expect(normalizeMessageStatus(0)).toBe("SENT");
  });

  it("maps string status SENDING", () => {
    expect(normalizeMessageStatus("SENDING")).toBe("SENDING");
  });

  it("maps string status DELIVERED", () => {
    expect(normalizeMessageStatus("DELIVERED")).toBe("DELIVERED");
  });

  it("maps string status READ", () => {
    expect(normalizeMessageStatus("READ")).toBe("READ");
  });

  it("maps string status FAILED", () => {
    expect(normalizeMessageStatus("FAILED")).toBe("FAILED");
  });

  it("maps string status OFFLINE", () => {
    expect(normalizeMessageStatus("OFFLINE")).toBe("OFFLINE");
  });

  it("maps string status RECALLED", () => {
    expect(normalizeMessageStatus("RECALLED")).toBe("RECALLED");
  });

  it("maps string status DELETED", () => {
    expect(normalizeMessageStatus("DELETED")).toBe("DELETED");
  });

  it("normalizes lowercase string status", () => {
    expect(normalizeMessageStatus("sent")).toBe("SENT");
    expect(normalizeMessageStatus("delivered")).toBe("DELIVERED");
    expect(normalizeMessageStatus("read")).toBe("READ");
  });

  it("falls back to SENT for unknown string status", () => {
    expect(normalizeMessageStatus("UNKNOWN")).toBe("SENT");
    expect(normalizeMessageStatus("")).toBe("SENT");
  });

  it("falls back to SENT for null/undefined", () => {
    expect(normalizeMessageStatus(null)).toBe("SENT");
    expect(normalizeMessageStatus(undefined)).toBe("SENT");
  });
});

describe("normalizeMessage", () => {
  it("normalizes a camelCase DTO", () => {
    const raw = {
      id: "123",
      senderId: "user1",
      senderName: "Alice",
      receiverId: "user2",
      isGroupChat: false,
      messageType: "TEXT",
      content: "Hello",
      sendTime: "2024-01-01T00:00:00.000Z",
      status: 1,
    };
    const result = normalizeMessage(raw);
    expect(result.id).toBe("123");
    expect(result.senderId).toBe("user1");
    expect(result.senderName).toBe("Alice");
    expect(result.receiverId).toBe("user2");
    expect(result.isGroupChat).toBe(false);
    expect(result.messageType).toBe("TEXT");
    expect(result.content).toBe("Hello");
    expect(result.sendTime).toBe("2024-01-01T00:00:00.000Z");
    expect(result.status).toBe("SENT");
  });

  it("normalizes a snake_case DTO", () => {
    const raw = {
      id: "456",
      sender_id: "user3",
      receiver_id: "user4",
      client_message_id: "cm-1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "photo.jpg",
      media_url: "https://example.com/photo.jpg",
      created_at: "2024-01-01T00:00:00.000Z",
      status: 2,
    };
    const result = normalizeMessage(raw);
    expect(result.id).toBe("456");
    expect(result.senderId).toBe("user3");
    expect(result.receiverId).toBe("user4");
    expect(result.clientMessageId).toBe("cm-1");
    expect(result.messageType).toBe("IMAGE");
    expect(result.mediaUrl).toBe("https://example.com/photo.jpg");
    expect(result.status).toBe("DELIVERED");
  });

  it("detects group message from groupId", () => {
    const raw = {
      id: "789",
      senderId: "user1",
      groupId: "group1",
      messageType: "TEXT",
      content: "Hello group",
      sendTime: "2024-01-01T00:00:00.000Z",
      status: 1,
    };
    const result = normalizeMessage(raw);
    expect(result.isGroupChat).toBe(true);
    expect(result.groupId).toBe("group1");
  });

  it("handles sender nested object", () => {
    const raw = {
      id: "100",
      sender: { id: "user5", nickname: "Bob", avatar: "av.png" },
      messageType: "TEXT",
      content: "Hi",
      sendTime: "2024-01-01T00:00:00.000Z",
      status: 1,
    };
    const result = normalizeMessage(raw);
    expect(result.senderId).toBe("user5");
    expect(result.senderName).toBe("Bob");
    expect(result.senderAvatar).toBe("av.png");
  });

  it("returns empty defaults for null/undefined input", () => {
    const result = normalizeMessage(null);
    expect(result.id).toBe("");
    expect(result.senderId).toBe("");
    expect(result.content).toBe("");
    expect(result.messageType).toBe("TEXT");
    expect(result.status).toBe("SENT");
  });

  it("uses fallbackSendTime when no time fields present", () => {
    const raw = { id: "1", senderId: "u1", messageType: "TEXT", content: "x", status: 1 };
    const fallback = "2025-01-01T00:00:00.000Z";
    const result = normalizeMessage(raw, fallback);
    expect(result.sendTime).toBe(fallback);
  });

  it("normalizes fractional seconds in timestamps", () => {
    const raw = {
      id: "1",
      senderId: "u1",
      messageType: "TEXT",
      content: "x",
      status: 1,
      created_at: "2024-01-01T00:00:00.123456",
    };
    const result = normalizeMessage(raw);
    expect(result.sendTime).toBe("2024-01-01T00:00:00.123");
  });

  it("detects AI generated fields", () => {
    const raw = {
      id: "1",
      senderId: "u1",
      messageType: "AI_REPLY",
      content: "AI response",
      sendTime: "2024-01-01T00:00:00.000Z",
      status: 1,
      is_ai_generated: true,
      ai_provider: "deepseek",
      ai_model: "deepseek-chat",
    };
    const result = normalizeMessage(raw);
    expect(result.isAiGenerated).toBe(true);
    expect(result.aiProvider).toBe("deepseek");
    expect(result.aiModel).toBe("deepseek-chat");
  });
});

describe("normalizeConversation", () => {
  it("normalizes a private conversation", () => {
    const raw = {
      conversationId: "100_200",
      targetId: "200",
      conversationType: "PRIVATE",
      conversationName: "Bob",
      lastMessageTime: "2024-01-01T00:00:00.000Z",
      unreadCount: 3,
    };
    const result = normalizeConversation(raw, "100");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("private");
    expect(result!.targetId).toBe("200");
    expect(result!.conversationType).toBe("PRIVATE");
    expect(result!.unreadCount).toBe(3);
  });

  it("normalizes a group conversation", () => {
    const raw = {
      conversationId: "group_g1",
      targetId: "g1",
      conversationType: "GROUP",
      conversationName: "Team Chat",
      lastMessageTime: "2024-01-01T00:00:00.000Z",
      unreadCount: 5,
    };
    const result = normalizeConversation(raw, "100");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("group");
    expect(result!.targetId).toBe("g1");
    expect(result!.conversationType).toBe("GROUP");
    expect(result!.id).toBe("group_g1");
  });

  it("detects group via conversationType '2'", () => {
    const raw = {
      conversationId: "group_g2",
      targetId: "g2",
      conversationType: "2",
      conversationName: "Group 2",
      lastMessageTime: "2024-01-01T00:00:00.000Z",
    };
    const result = normalizeConversation(raw, "100");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("group");
  });

  it("returns null when no targetId can be resolved", () => {
    const raw = {
      conversationId: "",
      conversationType: "PRIVATE",
    };
    const result = normalizeConversation(raw, "100");
    expect(result).toBeNull();
  });

  it("resolves targetId from conversationId for private chat", () => {
    const raw = {
      conversationId: "100_200",
      conversationType: "PRIVATE",
      lastMessageTime: "2024-01-01T00:00:00.000Z",
    };
    const result = normalizeConversation(raw, "100");
    expect(result).not.toBeNull();
    expect(result!.targetId).toBe("200");
  });

  it("normalizes pinned and muted flags", () => {
    const raw = {
      conversationId: "100_200",
      targetId: "200",
      conversationType: "PRIVATE",
      isPinned: true,
      isMuted: true,
      lastMessageTime: "2024-01-01T00:00:00.000Z",
    };
    const result = normalizeConversation(raw, "100");
    expect(result).not.toBeNull();
    expect(result!.isPinned).toBe(true);
    expect(result!.pinned).toBe(true);
    expect(result!.isMuted).toBe(true);
    expect(result!.muted).toBe(true);
  });
});

describe("normalizeUser", () => {
  it("normalizes a user with camelCase fields", () => {
    const raw = {
      id: "u1",
      userId: "u1",
      username: "alice",
      nickname: "Alice",
      avatar: "av.png",
      email: "alice@example.com",
      phone: "1234567890",
      status: "online",
    };
    const result = normalizeUser(raw);
    expect(result.id).toBe("u1");
    expect(result.username).toBe("alice");
    expect(result.nickname).toBe("Alice");
    expect(result.avatar).toBe("av.png");
    expect(result.email).toBe("alice@example.com");
    expect(result.phone).toBe("1234567890");
    expect(result.status).toBe("online");
  });

  it("normalizes presence status", () => {
    expect(normalizeUser({ id: "1", username: "u", status: "online" }).status).toBe("online");
    expect(normalizeUser({ id: "1", username: "u", status: "busy" }).status).toBe("busy");
    expect(normalizeUser({ id: "1", username: "u", status: "away" }).status).toBe("away");
    expect(normalizeUser({ id: "1", username: "u", status: "offline" }).status).toBe("offline");
    expect(normalizeUser({ id: "1", username: "u", status: "ONLINE" }).status).toBe("online");
    expect(normalizeUser({ id: "1", username: "u", status: "unknown" }).status).toBe("offline");
  });

  it("falls back nickname to username", () => {
    const result = normalizeUser({ id: "1", username: "bob" });
    expect(result.nickname).toBe("bob");
  });

  it("returns empty defaults for non-object input", () => {
    const result = normalizeUser(null as any);
    expect(result.id).toBe("");
    expect(result.username).toBe("");
    expect(result.nickname).toBe("");
  });
});

describe("normalizeGroup", () => {
  it("normalizes a group DTO", () => {
    const raw = {
      id: "g1",
      name: "Team",
      groupName: "Team Group",
      description: "A team group",
      announcement: "Welcome",
      type: 1,
      avatar: "gav.png",
      ownerId: "u1",
      memberCount: 10,
      maxMembers: 500,
      status: 1,
      createTime: "2024-01-01T00:00:00.000Z",
    };
    const result = normalizeGroup(raw);
    expect(result.id).toBe("g1");
    expect(result.name).toBe("Team");
    expect(result.groupName).toBe("Team Group");
    expect(result.description).toBe("A team group");
    expect(result.announcement).toBe("Welcome");
    expect(result.avatar).toBe("gav.png");
    expect(result.ownerId).toBe("u1");
    expect(result.memberCount).toBe(10);
    expect(result.maxMembers).toBe(500);
    expect(result.createTime).toBe("2024-01-01T00:00:00.000Z");
  });

  it("returns empty defaults for non-object input", () => {
    const result = normalizeGroup(null);
    expect(result.id).toBe("");
    expect(result.ownerId).toBe("");
    expect(result.memberCount).toBe(0);
  });

  it("uses announcement as description fallback", () => {
    const raw = { id: "g1", ownerId: "u1", announcement: "Announce only" };
    const result = normalizeGroup(raw);
    expect(result.description).toBe("Announce only");
    expect(result.announcement).toBe("Announce only");
  });
});
