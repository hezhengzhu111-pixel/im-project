/**
 * 聊天状态管理
 * 管理聊天会话、消息、联系人等
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { messageService, friendService, groupService, userService } from "@/services";
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
        console.error('用户未登录，无法创建会话');
        return '';
      }
      const a = String(userId);
      const b = String(targetId);

      if (!b) return '';

      const aNum = Number(a);
      const bNum = Number(b);
      const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      if (bothNumeric) {
        return aNum < bNum ? `${a}_${b}` : `${b}_${a}`;
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
      console.error('无法生成有效的会话ID');
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
  const loadMessages = async (sessionId: string, page = 0, size = 50) => {
    try {
      loading.value = true;

      const session = sessions.value.find(s => s.id === sessionId);
      if (!session) {
        console.error('会话不存在:', sessionId);
        return;
      }

      // 使用新的 getHistory 接口，传入 sessionId
      const response = await messageService.getHistory(sessionId, { page, size });

      if (response.code === 200 && response.data) {
        const existingMessages = messages.value.get(sessionId) || [];
        
        const normalizedMessages = response.data.map((msg: any) => ({
          ...msg,
          senderId: msg.senderId || msg.sender?.id || msg.sender_id,
          messageType: msg.messageType || msg.type || 'TEXT',
          type: msg.type || msg.messageType || 'TEXT',
          senderName: msg.senderName || msg.sender?.nickname || msg.sender?.username,
          senderAvatar: msg.senderAvatar || msg.sender?.avatar,
        }));

        if (page === 0) {
          messages.value.set(sessionId, normalizedMessages);
        } else {
          const newMessages = [...normalizedMessages, ...existingMessages];
          messages.value.set(sessionId, newMessages);
        }
      }
    } catch (error) {
      console.error("加载消息失败:", error);
    } finally {
      loading.value = false;
    }
  };

  // 发送消息
  const sendMessage = async (
    content: string,
    type: "TEXT" | "IMAGE" | "FILE" | "VOICE" | "VIDEO" = "TEXT",
    extra?: any,
  ) => {
    if (!currentSession.value) {
      ElMessage.error("请先选择聊天对象");
      return false;
    }

    const userStore = useUserStore();

    try {
      const isTextLike = type === "TEXT" || type === "SYSTEM";
      const message: Message = {
        id: Date.now().toString(),
        senderId: userStore.userId!,
        senderName: userStore.nickname,
        senderAvatar: userStore.avatar,
        receiverId:
          currentSession.value.type === "private"
            ? currentSession.value.targetId
            : undefined,
        groupId:
          currentSession.value.type === "group"
            ? currentSession.value.targetId
            : undefined,
        isGroupChat: currentSession.value.type === "group",
        messageType: type,
        type: type,
        content: isTextLike ? content : "",
        mediaUrl: isTextLike ? undefined : content,
        sendTime: new Date().toISOString(),
        status: "SENDING",
        extra,
      };

      addMessage(message);

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
            message.status = "SENT";
        } else {
             message.status = "FAILED";
             ElMessage.error(response.message || "发送失败");
        }
      } catch (apiError) {
        console.error("API发送消息失败:", apiError);
        message.status = "FAILED";
        ElMessage.error("发送失败");
        return false;
      }

      return true;
    } catch (error) {
      console.error("发送消息失败:", error);
      ElMessage.error("发送失败");
      return false;
    }
  };

  // 添加消息
  const addMessage = (message: Message) => {
    let sessionId = "";
    if (message.isGroupChat && message.groupId) {
       sessionId = getSessionId("group", message.groupId.toString());
       if (!sessions.value.find(s => s.id === sessionId)) {
           const group = groups.value.find(g => g.id?.toString() === message.groupId?.toString());
           if (group) {
               createOrGetSession("group", message.groupId.toString(), group.groupName, group.avatar);
           } else {
               createOrGetSession("group", message.groupId.toString(), "未知群组");
           }
       }
    } else if (message.senderId && message.receiverId) {
       const userStore = useUserStore();
       const targetId = message.senderId.toString() === userStore.userId?.toString() 
            ? message.receiverId.toString() 
            : message.senderId.toString();
       
       sessionId = getSessionId("private", targetId);
       
       if (!sessions.value.find(s => s.id === sessionId)) {
           const targetName = message.senderName || "未知用户";
           const targetAvatar = message.senderAvatar || "";
           createOrGetSession("private", targetId, targetName, targetAvatar);
       }
    }

    if (!sessionId) return;

    const sessionMessages = messages.value.get(sessionId) || [];
    const existingIndex = sessionMessages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      sessionMessages[existingIndex] = message;
    } else {
      sessionMessages.push(message);
    }

    messages.value.set(sessionId, sessionMessages);
    updateSessionLastMessage(sessionId, message);
  };

  // 更新会话最后消息
  const updateSessionLastMessage = (sessionId: string, message: Message) => {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      session.lastMessage = message;
      session.lastActiveTime = message.sendTime;

      if (currentSession.value?.id !== sessionId) {
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
                    sendTime: conversation.lastMessageTime,
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
              lastActiveTime: conversation.lastMessageTime,
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
                new Date(session.lastActiveTime) > new Date(existing.lastActiveTime))
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
      const response = await groupService.getList(userStore.userId || '');

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

      if (response.code === 200 && response.data) {
        friendRequests.value = (response.data as any).content || response.data || [];
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
  const sendFriendRequest = async (params: { userId: string; message: string }) => {
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
        await Promise.all([loadFriends(), loadFriendRequests(), loadSessions()]);
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
        friends.value = friends.value.filter(f => f.friendId !== friendId);
        
        if (currentSession.value?.type === 'private' && currentSession.value.targetId === friendId) {
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
        const friend = friends.value.find(f => f.friendId === friendId);
        if (friend) {
          friend.remark = remark;
        }
        
        const session = sessions.value.find(s => s.type === 'private' && s.targetId === friendId);
        if (session) {
          session.targetName = remark || friend?.friend.nickname || friend?.friend.username || session.targetName;
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
  const createGroup = async (params: { name: string; description: string; memberIds: string[] }) => {
    try {
      const response = await groupService.create({
        groupName: params.name,
        description: params.description,
        memberIds: params.memberIds,
      });

      if (response.code === 200) {
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
      const response = await messageService.searchMessages(keyword, sessionId);

      if (response.code === 200 && response.data) {
        searchResults.value = response.data;
      }
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
      const response = await messageService.deleteMessage(messageId);

      if (response.code === 200) {
        messages.value.forEach((messageList, sessionId) => {
          const index = messageList.findIndex((m) => m.id === messageId);
          if (index >= 0) {
            messageList.splice(index, 1);
            messages.value.set(sessionId, messageList);
          }
        });

        ElMessage.success("删除成功");
      }
    } catch (error) {
      console.error("删除消息失败:", error);
      ElMessage.error("删除失败");
    }
  };

  // 清空聊天记录
  const clearMessages = async (sessionId: string) => {
    try {
      const response = await messageService.clearMessages(sessionId);

      if (response.code === 200) {
        messages.value.set(sessionId, []);
        ElMessage.success("清空成功");
      }
    } catch (error) {
      console.error("清空聊天记录失败:", error);
      ElMessage.error("清空失败");
    }
  };

  // 标记消息为已读
  const markAsRead = async (sessionId: string) => {
    try {
      await messageService.markRead(sessionId);

      const session = sessions.value.find((s) => s.id === sessionId);
      if (session) {
        session.unreadCount = 0;
        unreadCounts.value.set(sessionId, 0);
      }
    } catch (error) {
      console.error("标记已读失败:", error);
    }
  };

  // 加载群组邀请
  const loadGroupInvites = async () => {
    try {
      const response = await groupService.getInvites();
      if (response.code === 200) {
        groupInvites.value = response.data || [];
      }
    } catch (error) {
      console.error("加载群组邀请失败:", error);
    }
  };

  // 接受群组邀请
  const acceptGroupInvite = async (inviteId: string) => {
    try {
      const response = await groupService.handleInvite(inviteId, "ACCEPT");
      if (response.code === 200) {
        await Promise.all([loadGroups(), loadGroupInvites()]);
      } else {
        throw new Error(response.message || "操作失败");
      }
    } catch (error) {
      console.error("接受群组邀请失败:", error);
      throw error;
    }
  };

  // 拒绝群组邀请
  const rejectGroupInvite = async (inviteId: string) => {
    try {
      const response = await groupService.handleInvite(inviteId, "REJECT");
      if (response.code === 200) {
        await loadGroupInvites();
      } else {
        throw new Error(response.message || "操作失败");
      }
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
        groups.value = groups.value.filter(g => g.id !== groupId);
        // 如果当前会话是该群组，则清除当前会话
        if (currentSession.value?.type === 'group' && currentSession.value.targetId === groupId) {
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
    init,
    clear,
  };
});
