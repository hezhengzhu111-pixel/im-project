/**
 * 聊天状态管理
 * 管理聊天会话、消息、联系人等
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  messageService,
  friendService,
  groupService,
  userService,
} from "@/services";
import { heartbeatService } from "@/services/heartbeat";
import type {
  Message,
  ChatSession,
  MessageSearchResult,
  UserInfo,
} from "@/types";
import type { Friendship, FriendRequest } from "@/types/user";
import type { Group } from "@/types/group";
import { ElMessage } from "element-plus";
import { useUserStore } from "./user";
import { useWebSocketStore } from "./websocket";
import { messageRepo } from "@/utils/messageRepo";
import { normalizeMessageBase } from "@/utils/messageNormalize";

const toBigIntId = (v: any): bigint | null => {
  if (v == null) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isSafeInteger(v) || v <= 0) return null;
    return BigInt(v);
  }
  const s = String(v);
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
};

const compareId = (a: any, b: any): number => {
  const ai = toBigIntId(a);
  const bi = toBigIntId(b);
  if (ai != null && bi != null) return ai < bi ? -1 : ai > bi ? 1 : 0;
  return String(a).localeCompare(String(b));
};

const safePreferExistingId = (incoming: any, existing: any): any => {
  const inBig = toBigIntId(incoming);
  if (inBig != null) return inBig.toString();
  const exBig = toBigIntId(existing);
  if (exBig != null) return exBig.toString();
  return incoming ?? existing;
};

const splitTextByCodePoints = (text: string, maxLen: number): string[] => {
  const chars = Array.from(text ?? "");
  if (chars.length <= maxLen) return [text ?? ""];
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += maxLen) {
    chunks.push(chars.slice(i, i + maxLen).join(""));
  }
  return chunks;
};

export const useChatStore = defineStore("chat", () => {
  // 状态
  const currentSession = ref<ChatSession | null>(null);
  const sessions = ref<ChatSession[]>([]);
  const messages = ref<Map<string, Message[]>>(new Map());
  const friends = ref<Friendship[]>([]);
  const friendRequests = ref<FriendRequest[]>([]);
  const groups = ref<Group[]>([]);
  const groupInvites = ref<any[]>([]);
  const loading = ref(false);
  const searchResults = ref<MessageSearchResult[]>([]);
  const unreadCounts = ref<Map<string, number>>(new Map());
  const messageTextConfig = ref<{
    textEnforce: boolean;
    textMaxLength: number;
  } | null>(null);
  const sendingSessionLocks = ref<Set<string>>(new Set());
  const readSessionLocks = ref<Set<string>>(new Set());
  const readSessionLastAt = ref<Map<string, number>>(new Map());

  // 计算属性
  const currentMessages = computed(() => {
    if (!currentSession.value) return [];
    return messages.value.get(currentSession.value.id) || [];
  });

  const totalUnreadCount = computed(() => {
    let total = 0;
    unreadCounts.value.forEach((count) => (total += count));
    return total;
  });

  const sortedSessions = computed(() => {
    return [...sessions.value].sort((a, b) => {
      const aTime = new Date(a.lastActiveTime || 0).getTime();
      const bTime = new Date(b.lastActiveTime || 0).getTime();
      return bTime - aTime;
    });
  });

  // 获取会话ID
  const getSessionId = (
    type: "private" | "group",
    targetId: string,
  ): string => {
    const userStore = useUserStore();
    if (type === "private") {
      const userId = userStore.userId;
      if (!userId) {
        console.error("用户未登录，无法创建会话");
        return "";
      }
      const a = String(userId);
      const b = String(targetId);

      if (!b) return "";

      const aNum = Number(a);
      const bNum = Number(b);
      const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      if (bothNumeric) {
        return compareId(a, b) < 0 ? `${a}_${b}` : `${b}_${a}`;
      }
      return a.localeCompare(b) <= 0 ? `${a}_${b}` : `${b}_${a}`;
    }
    return `group_${targetId}`;
  };

  // 创建或获取会话
  const createOrGetSession = (
    type: "private" | "group",
    targetId: string,
    targetName?: string,
    targetAvatar?: string,
  ): ChatSession | null => {
    const sessionId = getSessionId(type, targetId);

    if (!sessionId) {
      console.error("无法生成有效的会话ID");
      return null;
    }

    let session = sessions.value.find((s) => s.id === sessionId);
    if (!session) {
      session = {
        id: sessionId,
        type,
        targetId,
        targetName: targetName || targetId,
        targetAvatar: targetAvatar || "",
        lastMessage: undefined,
        unreadCount: 0,
        lastActiveTime: new Date().toISOString(),
        isPinned: false,
        isMuted: false,
      };
      sessions.value.push(session);
    }

    return session;
  };

  // 设置当前会话
  const setCurrentSession = (session: ChatSession) => {
    currentSession.value = session;

    if (session.unreadCount > 0) {
      session.unreadCount = 0;
      unreadCounts.value.set(session.id, 0);
    }

    loadMessages(session.id);
  };

  // 加载消息
  const loadMessages = async (sessionId: string, page = 0, size = 20) => {
    try {
      loading.value = true;

      if (page === 0) {
        const cached = await messageRepo.listConversation(sessionId);
        if (cached.length) {
          const hasUnsafeLong = cached.some((m: any) => {
            const fields = [
              m?.id,
              m?.senderId,
              m?.receiverId,
              m?.groupId,
              (m as any)?.replyToMessageId,
            ];
            return fields.some(
              (v) =>
                typeof v === "number" &&
                (!Number.isFinite(v) || !Number.isSafeInteger(v)),
            );
          });
          if (hasUnsafeLong) {
            await messageRepo.clearConversation(sessionId);
          } else {
            let revivedCount = 0;
            const revived = cached.map((m: any) => {
              const normalizedBase = normalizeMessageBase(m);
              const normalized = {
                ...normalizedBase,
                id: safePreferExistingId(m.id, m.id),
                senderId: safePreferExistingId(
                  normalizedBase.senderId,
                  m.senderId,
                ),
                receiverId: safePreferExistingId(
                  m.receiverId || m.receiver_id,
                  m.receiverId,
                ),
                groupId: safePreferExistingId(
                  m.groupId || m.group_id,
                  m.groupId,
                ),
              };
              if (
                String(m.status) === "SENDING" &&
                String(m.id || "").startsWith("local_")
              ) {
                revivedCount += 1;
                return { ...normalized, status: "FAILED" };
              }
              return normalized;
            });
            messages.value.set(sessionId, revived);
            if (revivedCount > 0) {
              ElMessage.warning("检测到未送达消息，已标记为失败，可重发");
            }
          }
        }
      }

      const session = sessions.value.find((s) => s.id === sessionId);
      if (!session) {
        console.error("会话不存在:", sessionId);
        return;
      }
      const existingMessagesForCursor = messages.value.get(sessionId) || [];
      const serverIds = existingMessagesForCursor
        .map((m: any) => {
          const raw = m?.id;
          if (typeof raw === "string" && raw.startsWith("local_")) return null;
          return toBigIntId(raw);
        })
        .filter((n: any) => n != null) as bigint[];
      const maxServerId = serverIds.length
        ? serverIds.reduce((a, b) => (a > b ? a : b))
        : null;
      const minServerId = serverIds.length
        ? serverIds.reduce((a, b) => (a < b ? a : b))
        : null;

      const baseParams: any = { limit: size };
      let response: any = null;
      try {
        if (page === 0) {
          if (maxServerId != null) {
            response =
              session.type === "group"
                ? await messageService.getGroupHistoryCursor(session.targetId, {
                    ...baseParams,
                    after_message_id: maxServerId.toString(),
                    limit: Math.max(size, 50),
                  })
                : await messageService.getPrivateHistoryCursor(
                    session.targetId,
                    {
                      ...baseParams,
                      after_message_id: maxServerId.toString(),
                      limit: Math.max(size, 50),
                    },
                  );
          }
          if (!response || response.code !== 200) {
            response =
              session.type === "group"
                ? await messageService.getGroupHistoryCursor(
                    session.targetId,
                    baseParams,
                  )
                : await messageService.getPrivateHistoryCursor(
                    session.targetId,
                    baseParams,
                  );
          }
        } else {
          if (minServerId == null) {
            return;
          }
          response =
            session.type === "group"
              ? await messageService.getGroupHistoryCursor(session.targetId, {
                  ...baseParams,
                  last_message_id: minServerId.toString(),
                })
              : await messageService.getPrivateHistoryCursor(session.targetId, {
                  ...baseParams,
                  last_message_id: minServerId.toString(),
                });
        }
      } catch (e) {
        response =
          session.type === "group"
            ? await messageService.getGroupHistory(session.targetId, {
                page,
                size,
              })
            : await messageService.getPrivateHistory(session.targetId, {
                page,
                size,
              });
      }

      if (response.code === 200 && response.data) {
        const existingMessages = messages.value.get(sessionId) || [];

        const normalizedMessages = response.data.map((msg: any) => {
          const normalizedBase = normalizeMessageBase(msg);
          return {
            ...normalizedBase,
            id: safePreferExistingId(msg.id, msg.id),
            senderId: safePreferExistingId(
              normalizedBase.senderId,
              msg.senderId,
            ),
            receiverId: safePreferExistingId(
              msg.receiverId || msg.receiver_id,
              msg.receiverId,
            ),
            groupId: safePreferExistingId(
              msg.groupId || msg.group_id,
              msg.groupId,
            ),
          };
        });
        normalizedMessages.sort(
          (a: any, b: any) =>
            new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime(),
        );

        if (page === 0) {
          const pending = existingMessages.filter((m: any) =>
            String(m.id || "").startsWith("local_"),
          );
          const existingServer = existingMessages.filter(
            (m: any) => !String(m.id || "").startsWith("local_"),
          );
          const serverMergedSource =
            maxServerId != null
              ? [...existingServer, ...normalizedMessages]
              : normalizedMessages;
          const byId = new Map<string, any>();
          for (const m of serverMergedSource) {
            byId.set(String(m.id), m);
          }
          const mergedServer = Array.from(byId.values());
          const merged = [...mergedServer, ...pending].sort(
            (a: any, b: any) =>
              new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime(),
          );
          messages.value.set(sessionId, merged);
          if (normalizedMessages.length) {
            await messageRepo.upsertServerMessages(
              sessionId,
              normalizedMessages,
            );
          }
        } else {
          const newMessages = [...normalizedMessages, ...existingMessages];
          newMessages.sort(
            (a: any, b: any) =>
              new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime(),
          );
          messages.value.set(sessionId, newMessages);
          await messageRepo.upsertServerMessages(sessionId, normalizedMessages);
        }
      }
    } catch (error) {
      console.error("加载消息失败:", error);
    } finally {
      loading.value = false;
    }
  };

  // 发送消息
  const sendSingleMessage = async (
    session: ChatSession,
    content: string,
    type: "TEXT" | "IMAGE" | "FILE" | "VOICE" | "VIDEO" = "TEXT",
    extra?: any,
  ) => {
    const userStore = useUserStore();

    try {
      const isTextLike = type === "TEXT";
      const localId = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const message: Message = {
        id: localId,
        senderId: userStore.userId!,
        senderName: userStore.nickname,
        senderAvatar: userStore.avatar,
        receiverId: session.type === "private" ? session.targetId : undefined,
        groupId: session.type === "group" ? session.targetId : undefined,
        isGroupChat: session.type === "group",
        messageType: type,
        type: type,
        content: isTextLike ? content : "",
        mediaUrl: isTextLike ? undefined : content,
        sendTime: new Date().toISOString(),
        status: "SENDING",
        extra,
      };

      addMessage(message);
      await messageRepo.upsertPendingMessage(session.id, localId, message);

      const request: any = {
        receiverId: message.receiverId,
        groupId: message.groupId,
        messageType: type,
        content: isTextLike ? content : undefined,
        mediaUrl: isTextLike ? undefined : content,
      };
      if (extra) {
        request.extra = extra;
      }

      try {
        let response;
        if (request.groupId) {
          response = await messageService.sendGroup(request);
        } else {
          response = await messageService.sendPrivate(request);
        }

        if (response.code === 200) {
          const data: any = response.data;
          if (
            data &&
            typeof data === "object" &&
            ("id" in data || "createdTime" in data || "created_at" in data)
          ) {
            const normalizedBase = normalizeMessageBase(
              { ...message, ...data },
              message.sendTime,
            );
            const serverMsg: Message = {
              ...normalizedBase,
              id: safePreferExistingId(data.id, message.id),
              senderId: safePreferExistingId(data.senderId, message.senderId),
              receiverId: safePreferExistingId(
                data.receiverId,
                message.receiverId,
              ),
              groupId: safePreferExistingId(data.groupId, message.groupId),
              status: "SENT",
            };
            const list = messages.value.get(session.id) || [];
            const idx = list.findIndex((m) => String(m.id) === String(localId));
            if (idx >= 0) {
              list[idx] = serverMsg as any;
              messages.value.set(session.id, list);
            }
            await messageRepo.removePendingMessage(session.id, localId);
            await messageRepo.upsertServerMessages(session.id, [serverMsg]);
          } else {
            message.status = "SENT";
            await messageRepo.upsertPendingMessage(
              session.id,
              localId,
              message,
            );
          }
        } else {
          message.status = "FAILED";
          ElMessage.error(response.message || "发送失败");
          await messageRepo.upsertPendingMessage(session.id, localId, message);
        }
      } catch (apiError) {
        console.error("API发送消息失败:", apiError);
        message.status = "FAILED";
        ElMessage.error("发送失败");
        await messageRepo.upsertPendingMessage(session.id, localId, message);
        return false;
      }

      return true;
    } catch (error) {
      console.error("发送消息失败:", error);
      ElMessage.error("发送失败");
      return false;
    }
  };

  const sendMessage = async (
    content: string,
    type: "TEXT" | "IMAGE" | "FILE" | "VOICE" | "VIDEO" = "TEXT",
    extra?: any,
  ) => {
    const session = currentSession.value;
    if (!session) {
      ElMessage.error("请先选择聊天对象");
      return false;
    }

    const lockSessionId = session.id;
    let lockWait = 0;
    while (sendingSessionLocks.value.has(lockSessionId) && lockWait < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      lockWait += 25;
    }
    if (sendingSessionLocks.value.has(lockSessionId)) {
      ElMessage.warning("会话发送繁忙，请稍后重试");
      return false;
    }
    sendingSessionLocks.value.add(lockSessionId);

    try {
      if (type === "TEXT") {
        if (!messageTextConfig.value) {
          try {
            const resp: any = await messageService.getConfig();
            if (resp?.code === 200 && resp?.data) {
              const enforce = Boolean(resp.data.textEnforce);
              const maxLen = Number(resp.data.textMaxLength);
              messageTextConfig.value = {
                textEnforce: enforce,
                textMaxLength: Number.isFinite(maxLen) ? maxLen : 2000,
              };
            }
          } catch {}
        }

        const cfg = messageTextConfig.value || {
          textEnforce: true,
          textMaxLength: 2000,
        };
        if (cfg.textEnforce && cfg.textMaxLength > 0) {
          const parts = splitTextByCodePoints(content, cfg.textMaxLength);
          if (parts.length > 1) {
            ElMessage.warning(`内容过长，已拆分为${parts.length}条发送`);
            for (const part of parts) {
              const ok = await sendSingleMessage(session, part, type, extra);
              if (!ok) return false;
            }
            return true;
          }
        }
      }

      return sendSingleMessage(session, content, type, extra);
    } finally {
      sendingSessionLocks.value.delete(lockSessionId);
    }
  };

  // 添加消息
  const addMessage = (message: Message) => {
    let sessionId = "";
    if (message.isGroupChat && message.groupId) {
      sessionId = getSessionId("group", message.groupId.toString());
      if (!sessions.value.find((s) => s.id === sessionId)) {
        const group = groups.value.find(
          (g) => g.id?.toString() === message.groupId?.toString(),
        );
        if (group) {
          createOrGetSession(
            "group",
            message.groupId.toString(),
            group.groupName,
            group.avatar,
          );
        } else {
          createOrGetSession("group", message.groupId.toString(), "未知群组");
        }
      }
    } else if (message.senderId && message.receiverId) {
      const userStore = useUserStore();
      const targetId =
        message.senderId.toString() === userStore.userId?.toString()
          ? message.receiverId.toString()
          : message.senderId.toString();

      sessionId = getSessionId("private", targetId);

      if (!sessions.value.find((s) => s.id === sessionId)) {
        const targetName = message.senderName || "未知用户";
        const targetAvatar = message.senderAvatar || "";
        createOrGetSession("private", targetId, targetName, targetAvatar);
      }
    }

    if (!sessionId) return;

    const sessionMessages = messages.value.get(sessionId) || [];
    const existingIndex = sessionMessages.findIndex(
      (m) => String(m.id) === String(message.id),
    );
    if (existingIndex >= 0) {
      sessionMessages[existingIndex] = message;
    } else {
      sessionMessages.push(message);
    }
    sessionMessages.sort(
      (a: any, b: any) =>
        new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime(),
    );

    messages.value.set(sessionId, sessionMessages);
    updateSessionLastMessage(sessionId, message);
    const idStr = String((message as any).id || "");
    if (idStr.startsWith("local_")) {
      void messageRepo.upsertPendingMessage(sessionId, idStr, message);
    } else {
      void messageRepo.upsertServerMessages(sessionId, [message]);
    }
  };

  // 更新会话最后消息
  const updateSessionLastMessage = (sessionId: string, message: Message) => {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      session.lastMessage = message;
      session.lastActiveTime = message.sendTime;

      const currentUserId = String(useUserStore().userId || "");
      const isSelfMessage = String(message.senderId || "") === currentUserId;
      if (!isSelfMessage && currentSession.value?.id !== sessionId) {
        session.unreadCount = (session.unreadCount || 0) + 1;
        unreadCounts.value.set(sessionId, session.unreadCount);
      }
    }
  };

  // 加载会话列表
  const loadSessions = async () => {
    try {
      const response = await messageService.getConversations();

      if (response.code === 200 && response.data) {
        const convertedSessions: ChatSession[] = response.data.map(
          (conversation: any) => {
            const isGroup =
              conversation.conversationType === 2 ||
              conversation.type === "GROUP" ||
              conversation.type === 2;

            const userIdStr = String(useUserStore().userId);
            const rawTargetId =
              conversation.targetId ||
              conversation.partnerId ||
              conversation.friendId ||
              conversation.userId ||
              "";

            let targetId = String(rawTargetId || "").trim();
            const convIdStr = String(conversation.conversationId || "").trim();
            const convParts = convIdStr ? convIdStr.split("_") : [];
            const otherFromConvId =
              convParts.length === 2
                ? convParts.find((p) => p && p !== userIdStr) || ""
                : "";

            if (!isGroup) {
              if (!targetId || targetId === userIdStr) {
                if (otherFromConvId) {
                  targetId = otherFromConvId;
                }
              }
            }

            if (!targetId) {
              targetId = convIdStr;
            }

            const sessionId = isGroup
              ? `group_${targetId || convIdStr || ""}`
              : targetId
                ? getSessionId("private", targetId)
                : convIdStr;

            const lastTimeRaw: any = conversation.lastMessageTime;
            const lastTime =
              typeof lastTimeRaw === "string"
                ? lastTimeRaw.replace(
                    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
                    "$1.$2",
                  )
                : lastTimeRaw;

            const lastMsg =
              conversation.lastMessage || conversation.lastMessageType
                ? {
                    content: conversation.lastMessage || "",
                    messageType:
                      conversation.lastMessageType ||
                      conversation.lastMessage?.messageType ||
                      "TEXT",
                    senderId: conversation.lastMessageSenderId,
                    senderName: conversation.lastMessageSenderName,
                    sendTime: lastTime,
                  }
                : undefined;

            return {
              id: sessionId,
              type: isGroup ? "group" : "private",
              targetId: targetId,
              targetName: conversation.conversationName || "",
              targetAvatar: conversation.conversationAvatar || "",
              lastMessage: lastMsg,
              unreadCount: conversation.unreadCount || 0,
              lastActiveTime: lastTime,
              isPinned: conversation.isPinned || false,
              isMuted: conversation.isMuted || false,
            };
          },
        );

        const userIdStr = String(useUserStore().userId);
        const uniqueSessions = new Map<string, ChatSession>();

        convertedSessions
          .filter((s) => s.id && s.targetId && String(s.targetId) !== userIdStr)
          .forEach((session) => {
            const existing = uniqueSessions.get(session.id);
            if (
              !existing ||
              (session.lastActiveTime &&
                existing.lastActiveTime &&
                new Date(session.lastActiveTime) >
                  new Date(existing.lastActiveTime))
            ) {
              uniqueSessions.set(session.id, session);
            }
          });

        sessions.value = Array.from(uniqueSessions.values());
      }
    } catch (error) {
      console.error("加载会话列表失败:", error);
    }
  };

  // 加载好友列表
  const loadFriends = async () => {
    try {
      loading.value = true;
      const response = await friendService.getList();

      if (response.code === 200 && response.data) {
        friends.value = response.data;
        heartbeatService.refreshFriends();
      }
    } catch (error) {
      console.error("加载好友列表失败:", error);
      ElMessage.error("加载好友列表失败");
    } finally {
      loading.value = false;
    }
  };

  // 加载群组列表
  const loadGroups = async () => {
    try {
      loading.value = true;
      const userStore = useUserStore();
      const response = await groupService.getList(userStore.userId || "");

      if (response.code === 200 && response.data) {
        groups.value = response.data;
      }
    } catch (error) {
      console.error("加载群组列表失败:", error);
      ElMessage.error("加载群组列表失败");
    } finally {
      loading.value = false;
    }
  };

  // 加载好友申请列表
  const loadFriendRequests = async () => {
    try {
      const response = await friendService.getRequests();
      console.log("loadFriendRequests response:", response);

      if (response.code === 200 && response.data) {
        const data = response.data as any;
        friendRequests.value = Array.isArray(data) ? data : (data?.content || []);
        console.log("friendRequests.value updated:", friendRequests.value);
      }
    } catch (error) {
      console.error("加载好友申请列表失败:", error);
    }
  };

  // 搜索用户
  const searchUsers = async (params: { type: string; keyword: string }) => {
    try {
      const response = await userService.search(params.keyword, params.type);
      if (response.code === 200 && response.data) {
        return response.data as unknown as UserInfo[];
      }
      return [];
    } catch (error) {
      console.error("搜索用户失败:", error);
      throw error;
    }
  };

  // 发送好友请求
  const sendFriendRequest = async (params: {
    userId: string;
    message: string;
  }) => {
    try {
      const response = await friendService.add({
        userId: params.userId,
        message: params.message,
      });

      if (response.code !== 200) {
        throw new Error(response.message || "发送请求失败");
      }
      return response.data;
    } catch (error) {
      console.error("发送好友请求失败:", error);
      throw error;
    }
  };

  // 接受好友请求
  const acceptFriendRequest = async (requestId: string) => {
    try {
      const response = await friendService.handleRequest({
        requestId,
        action: "ACCEPT",
      });

      if (response.code === 200) {
        await Promise.all([
          loadFriends(),
          loadFriendRequests(),
          loadSessions(),
        ]);
      } else {
        throw new Error(response.message || "操作失败");
      }
    } catch (error) {
      console.error("接受好友请求失败:", error);
      throw error;
    }
  };

  // 拒绝好友请求
  const rejectFriendRequest = async (requestId: string) => {
    try {
      const response = await friendService.handleRequest({
        requestId,
        action: "REJECT",
      });

      if (response.code === 200) {
        await loadFriendRequests();
      } else {
        throw new Error(response.message || "操作失败");
      }
    } catch (error) {
      console.error("拒绝好友请求失败:", error);
      throw error;
    }
  };

  // 删除好友
  const deleteFriend = async (friendId: string) => {
    try {
      const response = await friendService.delete(friendId);

      if (response.code === 200) {
        friends.value = friends.value.filter((f) => f.friendId !== friendId);

        if (
          currentSession.value?.type === "private" &&
          currentSession.value.targetId === friendId
        ) {
          currentSession.value = null;
        }
      } else {
        throw new Error(response.message || "删除失败");
      }
    } catch (error) {
      console.error("删除好友失败:", error);
      throw error;
    }
  };

  // 修改好友备注
  const updateFriendRemark = async (friendId: string, remark: string) => {
    try {
      const response = await friendService.updateRemark(friendId, remark);

      if (response.code === 200) {
        const friend = friends.value.find((f) => f.friendId === friendId);
        if (friend) {
          friend.remark = remark;
        }

        const session = sessions.value.find(
          (s) => s.type === "private" && s.targetId === friendId,
        );
        if (session) {
          session.targetName =
            remark ||
            friend?.nickname ||
            friend?.username ||
            session.targetName;
        }
      } else {
        throw new Error(response.message || "操作失败");
      }
    } catch (error) {
      console.error("修改备注失败:", error);
      throw error;
    }
  };

  // 创建群组
  const createGroup = async (params: {
    name: string;
    description: string;
    avatar?: string;
    memberIds: string[];
  }) => {
    try {
      const response = await groupService.create({
        name: params.name,
        type: 1,
        announcement: params.description,
        memberIds: params.memberIds,
      });

      if (response.code === 200) {
        const groupId = response.data?.id;
        if (groupId && params.memberIds.length > 0) {
          await groupService.addMembers(
            String(groupId),
            params.memberIds,
            String(useUserStore().userId || ""),
          );
        }
        await loadGroups();
      } else {
        throw new Error(response.message || "创建群组失败");
      }
    } catch (error) {
      console.error("创建群组失败:", error);
      throw error;
    }
  };

  // 搜索消息
  const searchMessages = async (keyword: string, sessionId?: string) => {
    try {
      loading.value = true;
      const kw = (keyword || "").trim().toLowerCase();
      if (!kw) {
        searchResults.value = [];
        return;
      }
      const sessionIds = sessionId
        ? [sessionId]
        : Array.from(messages.value.keys());
      const results: MessageSearchResult[] = [];
      for (const sid of sessionIds) {
        const list = messages.value.get(sid) || [];
        for (let i = 0; i < list.length; i++) {
          const msg = list[i] as any;
          const content = String(msg.content || "").toLowerCase();
          if (!content.includes(kw)) continue;
          const ctx = list.slice(
            Math.max(0, i - 1),
            Math.min(list.length, i + 2),
          );
          results.push({
            message: msg,
            highlight: keyword,
            context: ctx,
          } as any);
        }
      }
      searchResults.value = results;
    } catch (error) {
      console.error("搜索消息失败:", error);
      ElMessage.error("搜索失败");
    } finally {
      loading.value = false;
    }
  };

  // 删除消息
  const deleteMessage = async (messageId: string) => {
    try {
      messages.value.forEach((messageList, sessionId) => {
        const index = messageList.findIndex((m) => m.id === messageId);
        if (index >= 0) {
          messageList.splice(index, 1);
          messages.value.set(sessionId, messageList);
        }
      });
      ElMessage.success("删除成功");
    } catch (error) {
      console.error("删除消息失败:", error);
      ElMessage.error("删除失败");
    }
  };

  // 清空聊天记录
  const clearMessages = async (sessionId: string) => {
    try {
      messages.value.set(sessionId, []);
      ElMessage.success("清空成功");
    } catch (error) {
      console.error("清空聊天记录失败:", error);
      ElMessage.error("清空失败");
    }
  };

  // 标记消息为已读
  const markAsRead = async (sessionId: string) => {
    const now = Date.now();
    const last = readSessionLastAt.value.get(sessionId) || 0;
    if (now - last < 400) {
      const session = sessions.value.find((s) => s.id === sessionId);
      if (session) {
        session.unreadCount = 0;
        unreadCounts.value.set(sessionId, 0);
      }
      return;
    }
    if (readSessionLocks.value.has(sessionId)) {
      return;
    }
    readSessionLocks.value.add(sessionId);
    try {
      await messageService.markRead(sessionId);
      readSessionLastAt.value.set(sessionId, now);

      const session = sessions.value.find((s) => s.id === sessionId);
      if (session) {
        session.unreadCount = 0;
        unreadCounts.value.set(sessionId, 0);
      }
    } catch (error) {
      console.error("标记已读失败:", error);
    } finally {
      readSessionLocks.value.delete(sessionId);
    }
  };

  const applyReadReceipt = (receipt: any) => {
    const readerId = receipt?.readerId ?? receipt?.reader_id;
    if (!readerId) return;
    const currentUserId = String(useUserStore().userId || "");
    if (!currentUserId) return;
    const conversationId = String(receipt?.conversationId || "");
    const isGroupReceipt = conversationId.startsWith("group_");
    const sessionId = isGroupReceipt
      ? conversationId
      : getSessionId("private", String(readerId));
    if (!sessionId) return;

    const lastIdRaw =
      receipt?.lastReadMessageId ?? receipt?.last_read_message_id;
    const lastId = toBigIntId(lastIdRaw);
    const readAtRaw = receipt?.readAt ?? receipt?.read_at;
    const readAt =
      typeof readAtRaw === "string"
        ? readAtRaw.replace(
            /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
            "$1.$2",
          )
        : readAtRaw;
    const readAtMs = readAt ? new Date(readAt as any).getTime() : NaN;

    const list = messages.value.get(sessionId) || [];
    let changed = false;
    const updated = list.map((m: any) => {
      const isMine = String(m.senderId) === currentUserId;
      if (!isMine) return m;
      if (!(m.status === "SENT" || m.status === "DELIVERED") && !isGroupReceipt)
        return m;
      if (lastId != null) {
        const msgId = toBigIntId(m.id);
        if (msgId == null || msgId > lastId) return m;
      }
      const msgMs = new Date(m.sendTime).getTime();
      if (
        Number.isFinite(readAtMs) &&
        Number.isFinite(msgMs) &&
        msgMs > readAtMs
      )
        return m;
      changed = true;
      if (isGroupReceipt) {
        const readers = Array.isArray(m.readBy) ? m.readBy : [];
        if (readers.includes(String(readerId))) {
          return m;
        }
        return {
          ...m,
          readBy: [...readers, String(readerId)],
          readByCount: [...readers, String(readerId)].length,
          readStatus: 1,
        };
      }
      return {
        ...m,
        status: "READ",
        readStatus: 1,
        readAt: typeof readAt === "string" ? readAt : m.readAt,
      };
    });

    if (changed) {
      messages.value.set(sessionId, updated);
      void messageRepo.upsertServerMessages(
        sessionId,
        updated.filter((m: any) => !String(m.id || "").startsWith("local_")),
      );
    }
  };

  // 加载群组邀请
  const loadGroupInvites = async () => {
    try {
      groupInvites.value = [];
    } catch (error) {
      console.error("加载群组邀请失败:", error);
    }
  };

  // 接受群组邀请
  const acceptGroupInvite = async (inviteId: string) => {
    try {
      void inviteId;
      await Promise.all([loadGroups(), loadGroupInvites()]);
    } catch (error) {
      console.error("接受群组邀请失败:", error);
      throw error;
    }
  };

  // 拒绝群组邀请
  const rejectGroupInvite = async (inviteId: string) => {
    try {
      void inviteId;
      await loadGroupInvites();
    } catch (error) {
      console.error("拒绝群组邀请失败:", error);
      throw error;
    }
  };

  // 退出群组
  const leaveGroup = async (groupId: string) => {
    try {
      const response = await groupService.quit(groupId);
      if (response.code === 200) {
        groups.value = groups.value.filter((g) => g.id !== groupId);
        // 如果当前会话是该群组，则清除当前会话
        if (
          currentSession.value?.type === "group" &&
          currentSession.value.targetId === groupId
        ) {
          currentSession.value = null;
        }
      } else {
        throw new Error(response.message || "退出失败");
      }
    } catch (error) {
      console.error("退出群组失败:", error);
      throw error;
    }
  };

  const syncOfflineMessages = async (batchSize = 50) => {
    const size = Math.max(20, Math.min(batchSize, 100));
    await loadSessions();
    const needSync = sessions.value
      .filter((s) => (s.unreadCount || 0) > 0)
      .map((s) => s.id);
    if (currentSession.value?.id) {
      needSync.push(currentSession.value.id);
    }
    const uniqueSessionIds = Array.from(new Set(needSync.filter(Boolean)));
    await Promise.all(
      uniqueSessionIds.map((sessionId) => loadMessages(sessionId, 0, size)),
    );
  };

  // 初始化
  const init = async () => {
    await Promise.all([
      loadFriends(),
      loadFriendRequests(),
      loadGroups(),
      loadSessions(),
    ]);
  };

  // 清空状态
  const clear = () => {
    currentSession.value = null;
    sessions.value = [];
    messages.value.clear();
    friends.value = [];
    groups.value = [];
    searchResults.value = [];
    unreadCounts.value.clear();
  };

  return {
    currentSession,
    sessions,
    messages,
    friends,
    friendRequests,
    groups,
    groupInvites,
    loading,
    searchResults,
    unreadCounts,
    currentMessages,
    totalUnreadCount,
    sortedSessions,
    createOrGetSession,
    setCurrentSession,
    loadMessages,
    sendMessage,
    addMessage,
    loadFriends,
    loadFriendRequests,
    loadSessions,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    deleteFriend,
    updateFriendRemark,
    createGroup,
    loadGroups,
    loadGroupInvites,
    acceptGroupInvite,
    rejectGroupInvite,
    leaveGroup,
    searchMessages,
    deleteMessage,
    clearMessages,
    markAsRead,
    applyReadReceipt,
    syncOfflineMessages,
    init,
    clear,
  };
});
