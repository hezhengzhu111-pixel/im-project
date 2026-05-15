import { describe, it, expect } from "vitest";
import { normalizeConversation } from "../chat.js";

const CURRENT_USER = "100";

describe("normalizeConversation", () => {
  // =========================================================================
  // 1. 私聊 conversation
  // =========================================================================
  describe("private conversation type detection", () => {
    it("detects PRIVATE via conversationType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("private");
      expect(result!.conversationType).toBe("PRIVATE");
    });

    it("detects private via conversation_type (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("private");
      expect(result!.conversationType).toBe("PRIVATE");
    });

    it("detects private via type = 'private'", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        type: "private",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("private");
    });

    it("detects private via type = '1' (numeric string)", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        type: "1",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("private");
    });
  });

  // =========================================================================
  // 2. 群聊 conversation
  // =========================================================================
  describe("group conversation type detection", () => {
    it("detects GROUP via conversationType", () => {
      const raw = {
        conversationId: "group_g1",
        targetId: "g1",
        conversationType: "GROUP",
        conversationName: "Team",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("group");
      expect(result!.conversationType).toBe("GROUP");
    });

    it("detects group via conversation_type (snake_case)", () => {
      const raw = {
        conversation_id: "group_g1",
        target_id: "g1",
        conversation_type: "GROUP",
        conversation_name: "Team",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("group");
      expect(result!.conversationType).toBe("GROUP");
    });

    it("detects group via type = 'group'", () => {
      const raw = {
        conversationId: "group_g1",
        targetId: "g1",
        type: "group",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("group");
    });

    it("detects group via conversationType = '2'", () => {
      const raw = {
        conversationId: "group_g1",
        targetId: "g1",
        conversationType: "2",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("group");
    });
  });

  // =========================================================================
  // 3. targetId 推断
  // =========================================================================
  describe("targetId resolution", () => {
    it("resolves from targetId (camelCase)", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from target_id (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from partnerId", () => {
      const raw = {
        conversationId: "100_200",
        partnerId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from partner_id (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        partner_id: "200",
        conversation_type: "PRIVATE",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from friendId", () => {
      const raw = {
        conversationId: "100_200",
        friendId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from friend_id (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        friend_id: "200",
        conversation_type: "PRIVATE",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from userId", () => {
      const raw = {
        conversationId: "100_200",
        userId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves from user_id (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        user_id: "200",
        conversation_type: "PRIVATE",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("resolves group targetId from groupId", () => {
      const raw = {
        conversationId: "group_g1",
        groupId: "g1",
        conversationType: "GROUP",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("g1");
    });

    it("resolves group targetId from group_id (snake_case)", () => {
      const raw = {
        conversation_id: "group_g1",
        group_id: "g1",
        conversation_type: "GROUP",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("g1");
    });
  });

  // =========================================================================
  // 4. conversationId 推断
  // =========================================================================
  describe("conversationId inference", () => {
    it("infers targetId from private conversationId containing currentUserId", () => {
      const raw = {
        conversationId: "100_300",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("300");
    });

    it("infers targetId when currentUserId is second part", () => {
      const raw = {
        conversationId: "50_100",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("50");
    });

    it("strips group_ prefix from conversationId for group chats", () => {
      const raw = {
        conversationId: "group_g123",
        conversationType: "GROUP",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("g123");
    });

    it("handles conversationId with numeric group id", () => {
      const raw = {
        conversationId: "group_456",
        conversationType: "GROUP",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("456");
    });

    it("uses conversation_id (snake_case) for inference", () => {
      const raw = {
        conversation_id: "100_789",
        conversation_type: "PRIVATE",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("789");
    });
  });

  // =========================================================================
  // 5. display 字段
  // =========================================================================
  describe("display fields", () => {
    it("resolves name from conversationName", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        conversationName: "Alice",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("Alice");
    });

    it("resolves name from conversation_name (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        conversation_name: "Bob",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("Bob");
    });

    it("resolves name from targetName", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        targetName: "Charlie",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("Charlie");
    });

    it("resolves name from target_name (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        target_name: "David",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("David");
    });

    it("resolves name from groupName", () => {
      const raw = {
        conversationId: "group_g1",
        targetId: "g1",
        conversationType: "GROUP",
        groupName: "Engineering",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("Engineering");
    });

    it("resolves name from group_name (snake_case)", () => {
      const raw = {
        conversation_id: "group_g1",
        target_id: "g1",
        conversation_type: "GROUP",
        group_name: "Design",
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("Design");
    });

    it("resolves avatar from conversationAvatar", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        conversationAvatar: "https://example.com/av1.png",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetAvatar).toBe("https://example.com/av1.png");
    });

    it("resolves avatar from targetAvatar", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        targetAvatar: "https://example.com/av2.png",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetAvatar).toBe("https://example.com/av2.png");
    });

    it("resolves avatar from avatar field", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        avatar: "https://example.com/av3.png",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetAvatar).toBe("https://example.com/av3.png");
    });

    it("falls back to targetId when no name is provided", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe("200");
    });

    it("sets conversationName separately from targetName", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        conversationName: "Display Name",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.conversationName).toBe("Display Name");
      expect(result!.targetName).toBe("Display Name");
    });
  });

  // =========================================================================
  // 6. unread/pin/mute
  // =========================================================================
  describe("unread, pin, and mute flags", () => {
    it("normalizes unreadCount (camelCase)", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        unreadCount: 5,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.unreadCount).toBe(5);
    });

    it("normalizes unread_count (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        unread_count: 3,
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.unreadCount).toBe(3);
    });

    it("defaults unreadCount to 0", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.unreadCount).toBe(0);
    });

    it("normalizes isPinned (camelCase)", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        isPinned: true,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isPinned).toBe(true);
      expect(result!.pinned).toBe(true);
    });

    it("normalizes is_pinned (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        is_pinned: true,
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isPinned).toBe(true);
      expect(result!.pinned).toBe(true);
    });

    it("normalizes pinned field", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        pinned: true,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isPinned).toBe(true);
      expect(result!.pinned).toBe(true);
    });

    it("normalizes isMuted (camelCase)", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        isMuted: true,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isMuted).toBe(true);
      expect(result!.muted).toBe(true);
    });

    it("normalizes is_muted (snake_case)", () => {
      const raw = {
        conversation_id: "100_200",
        target_id: "200",
        conversation_type: "PRIVATE",
        is_muted: true,
        last_message_time: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isMuted).toBe(true);
      expect(result!.muted).toBe(true);
    });

    it("normalizes muted field", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        muted: true,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isMuted).toBe(true);
      expect(result!.muted).toBe(true);
    });

    it("defaults pin and mute to false", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.isPinned).toBe(false);
      expect(result!.pinned).toBe(false);
      expect(result!.isMuted).toBe(false);
      expect(result!.muted).toBe(false);
    });
  });

  // =========================================================================
  // 7. lastMessage
  // =========================================================================
  describe("lastMessage normalization", () => {
    it("creates preview message from string lastMessage", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "Hello world",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage).toBeDefined();
      expect(result!.lastMessage!.content).toBe("Hello world");
      expect(result!.lastMessage!.messageType).toBe("TEXT");
    });

    it("normalizes IMAGE lastMessageType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "[Image]",
        lastMessageType: "IMAGE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("IMAGE");
    });

    it("normalizes FILE lastMessageType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "[File]",
        lastMessageType: "FILE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("FILE");
    });

    it("normalizes VIDEO lastMessageType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "[Video]",
        lastMessageType: "VIDEO",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("VIDEO");
    });

    it("normalizes VOICE lastMessageType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "[Voice]",
        lastMessageType: "VOICE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("VOICE");
    });

    it("normalizes SYSTEM lastMessageType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "User joined",
        lastMessageType: "SYSTEM",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("SYSTEM");
    });

    it("falls back to TEXT for unknown lastMessageType", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "Something",
        lastMessageType: "UNKNOWN_TYPE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("TEXT");
    });

    it("normalizes lowercase lastMessageType to uppercase", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "[Image]",
        lastMessageType: "image",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage!.messageType).toBe("IMAGE");
    });

    it("includes lastMessageSenderId", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "Hello",
        lastMessageSenderId: "200",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessageSenderId).toBe("200");
      expect(result!.lastMessage!.senderId).toBe("200");
    });

    it("includes lastMessageSenderName", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: "Hello",
        lastMessageSenderName: "Bob",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessageSenderName).toBe("Bob");
      expect(result!.lastMessage!.senderName).toBe("Bob");
    });

    it("returns undefined lastMessage when no content or type", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage).toBeUndefined();
    });

    it("handles Record<string, unknown> lastMessage", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessage: { content: "From object" },
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastMessage).toBeDefined();
      expect(result!.lastMessage!.content).toBe("");
    });
  });

  // =========================================================================
  // 8. 返回 null
  // =========================================================================
  describe("null return cases", () => {
    it("returns null when no targetId and cannot infer from conversationId", () => {
      const raw = {
        conversationId: "",
        conversationType: "PRIVATE",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(normalizeConversation(null, CURRENT_USER)).toBeNull();
      expect(normalizeConversation(undefined, CURRENT_USER)).toBeNull();
      expect(normalizeConversation("string", CURRENT_USER)).toBeNull();
      expect(normalizeConversation(123, CURRENT_USER)).toBeNull();
    });

    it("returns null when conversationId is empty and no targetId", () => {
      const raw = {
        conversationType: "PRIVATE",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).toBeNull();
    });

    it("keeps targetId when equals currentUserId and cannot infer from conversationId", () => {
      const raw = {
        conversationId: "100",
        targetId: "100",
        conversationType: "PRIVATE",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      // Source code tries to infer from conversationId but "100" has no other part
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("100");
    });
  });

  // =========================================================================
  // 9. 边界情况
  // =========================================================================
  describe("edge cases", () => {
    it("handles numeric string targetId", () => {
      const raw = {
        conversationId: "100_200",
        targetId: 200,
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.targetId).toBe("200");
    });

    it("handles string conversationType '2' for group", () => {
      const raw = {
        conversationId: "group_g1",
        targetId: "g1",
        conversationType: 2,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("group");
    });

    it("builds correct session id for private chat", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("100_200");
    });

    it("builds correct session id for group chat", () => {
      const raw = {
        conversationId: "group_g1",
        targetId: "g1",
        conversationType: "GROUP",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("group_g1");
    });

    it("sets lastActiveTime and updateTime from lastMessageTime", () => {
      const time = "2024-01-01T00:00:00.000Z";
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: time,
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.lastActiveTime).toBe(time);
      expect(result!.updateTime).toBe(time);
      expect(result!.lastMessageTime).toBe(time);
    });

    it("handles encrypted flag", () => {
      const raw = {
        conversationId: "100_200",
        targetId: "200",
        conversationType: "PRIVATE",
        encrypted: true,
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.encrypted).toBe(true);
    });

    it("preserves conversationId in result", () => {
      const raw = {
        conversationId: "conv_123",
        targetId: "200",
        conversationType: "PRIVATE",
        lastMessageTime: "2024-01-01T00:00:00.000Z",
      };
      const result = normalizeConversation(raw, CURRENT_USER);
      expect(result).not.toBeNull();
      expect(result!.conversationId).toBe("conv_123");
    });
  });
});
