import { computed } from "vue";
import { defineStore } from "pinia";
import { groupService } from "@/services/group";
import { useContactStore } from "@/stores/contact";
import { useGroupStore } from "@/stores/group";
import { useMessageStore } from "@/stores/message";
import { useSessionStore } from "@/stores/session";
import { useUserStore } from "@/stores/user";
import type {
  ChatSession,
  Friend,
  Group,
  MessageType,
  User,
} from "@/types";

export const useChatStore = defineStore("chat", () => {
  const contactStore = useContactStore();
  const groupStore = useGroupStore();
  const messageStore = useMessageStore();
  const sessionStore = useSessionStore();
  const userStore = useUserStore();

  const loading = computed(
    () =>
      contactStore.loading ||
      groupStore.loading ||
      sessionStore.loading ||
      messageStore.loading,
  );

  const collectPresenceUserIds = () => {
    const ids = new Set<string>();
    contactStore.friends.forEach((friend) => {
      const friendId = String(friend.friendId || "").trim();
      if (friendId) {
        ids.add(friendId);
      }
    });
    sessionStore.sessions.forEach((session) => {
      if (session.type !== "private") {
        return;
      }
      const targetId = String(session.targetId || "").trim();
      if (targetId) {
        ids.add(targetId);
      }
    });
    if (sessionStore.currentSession?.type === "private") {
      const targetId = String(sessionStore.currentSession.targetId || "").trim();
      if (targetId) {
        ids.add(targetId);
      }
    }
    return Array.from(ids);
  };

  const refreshOnlineStatuses = async () => {
    const userIds = collectPresenceUserIds();
    if (userIds.length === 0) {
      return;
    }
    const { useWebSocketStore } = await import("@/stores/websocket");
    await useWebSocketStore().refreshOnlineStatus(userIds);
  };

  const restoreCurrentSession = async () => {
    const restored = sessionStore.restorePersistedCurrentSession(
      (targetId) => {
        const friend = contactStore.friends.find(
          (item) => String(item.friendId) === String(targetId),
        );
        if (!friend) {
          return null;
        }
        return sessionStore.ensurePrivateSession(
          targetId,
          friend.remark || friend.nickname || friend.username,
          friend.avatar,
        );
      },
      (targetId) => {
        const group = groupStore.groups.find(
          (item) => String(item.id) === String(targetId),
        );
        return group ? sessionStore.ensureGroupSession(group) : null;
      },
    );
    if (restored) {
      await messageStore.loadMessages(restored.id);
    }
  };

  const initChatBootstrap = async () => {
    await Promise.all([
      contactStore.loadFriends(),
      contactStore.loadFriendRequests(),
      groupStore.loadGroups(),
    ]);
    sessionStore.mergeGroupMetadata(groupStore.groups);
    await sessionStore.loadSessions(groupStore.groups);
    await restoreCurrentSession();
    await refreshOnlineStatuses();
  };

  const setCurrentSession = async (session: ChatSession) => {
    sessionStore.setCurrentSession(session);
    await messageStore.loadMessages(session.id);
  };

  const openPrivateSession = async (target: {
    targetId: string;
    targetName: string;
    targetAvatar?: string;
  }): Promise<ChatSession | null> => {
    const session = sessionStore.ensurePrivateSession(
      target.targetId,
      target.targetName,
      target.targetAvatar,
    );
    if (!session) {
      return null;
    }
    await setCurrentSession(session);
    return session;
  };

  const openGroupSession = async (group: Group): Promise<ChatSession | null> => {
    const session = sessionStore.ensureGroupSession(group);
    if (!session) {
      return null;
    }
    sessionStore.mergeGroupMetadata(groupStore.groups);
    await setCurrentSession(session);
    return session;
  };

  const loadSessions = async () => {
    await sessionStore.loadSessions(groupStore.groups);
    await refreshOnlineStatuses();
  };

  const loadFriends = async () => {
    await contactStore.loadFriends();
    await refreshOnlineStatuses();
  };

  const loadFriendRequests = async () => {
    await contactStore.loadFriendRequests();
  };

  const loadGroups = async () => {
    await groupStore.loadGroups();
    sessionStore.mergeGroupMetadata(groupStore.groups);
  };

  const searchUsers = async (params: { type: string; keyword: string }) => {
    return contactStore.searchUsers(params);
  };

  const sendFriendRequest = async (params: { userId: string; message: string }) => {
    return contactStore.sendFriendRequest(params);
  };

  const acceptFriendRequest = async (requestId: string) => {
    await contactStore.acceptFriendRequest(requestId);
    await Promise.all([loadFriends(), loadFriendRequests(), loadSessions()]);
  };

  const rejectFriendRequest = async (requestId: string) => {
    await contactStore.rejectFriendRequest(requestId);
    await loadFriendRequests();
  };

  const deleteFriend = async (friendId: string) => {
    await contactStore.deleteFriend(friendId);
    if (
      sessionStore.currentSession?.type === "private" &&
      sessionStore.currentSession.targetId === friendId
    ) {
      sessionStore.clearCurrentSession();
    }
  };

  const updateFriendRemark = async (friendId: string, remark: string) => {
    await contactStore.updateFriendRemark(friendId, remark);
    const friend = contactStore.friends.find((item) => item.friendId === friendId);
    sessionStore.updatePrivateSessionDisplay(
      friendId,
      remark || friend?.nickname || friend?.username || friendId,
      friend?.avatar,
    );
  };

  const createGroup = async (params: {
    name: string;
    description: string;
    avatar?: string;
    memberIds: string[];
  }) => {
    const created = await groupStore.createGroup(params);
    await Promise.all([loadGroups(), loadSessions()]);
    const refreshedGroup =
      groupStore.groups.find((item) => item.id === created.id) || created;
    await openGroupSession(refreshedGroup);
    return refreshedGroup;
  };

  const leaveGroup = async (groupId: string) => {
    await groupStore.leaveGroup(groupId);
    sessionStore.removeGroupSession(groupId);
    await messageStore.clearMessages(`group_${groupId}`);
  };

  const sendMessage = async (
    content: string,
    type: MessageType = "TEXT",
    extra?: Record<string, unknown>,
  ) => {
    return messageStore.sendMessage(sessionStore.currentSession, content, type, extra);
  };

  const syncOfflineMessages = async (batchSize = 50) => {
    await loadSessions();
    const sessionIds = sessionStore.sessions
      .filter((session) => (session.unreadCount || 0) > 0)
      .map((session) => session.id);
    if (sessionStore.currentSession?.id) {
      sessionIds.push(sessionStore.currentSession.id);
    }
    const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
    await Promise.all(
      uniqueIds.map((sessionId) =>
        messageStore.loadMessages(sessionId, 0, Math.max(20, Math.min(batchSize, 100))),
      ),
    );
  };

  const clear = () => {
    sessionStore.clear();
    messageStore.clear();
    contactStore.clear();
    groupStore.clear();
  };

  return {
    currentSession: computed(() => sessionStore.currentSession),
    currentSessionId: computed(() => sessionStore.currentSessionId),
    sessions: computed(() => sessionStore.sessions),
    sortedSessions: computed(() => sessionStore.sortedSessions),
    unreadCounts: computed(() => sessionStore.unreadCounts),
    totalUnreadCount: computed(() => sessionStore.totalUnreadCount),
    messages: computed(() => messageStore.messages),
    currentMessages: computed(() => messageStore.currentMessages),
    searchResults: computed(() => messageStore.searchResults),
    friends: computed(() => contactStore.friends),
    friendRequests: computed(() => contactStore.friendRequests),
    groups: computed(() => groupStore.groups),
    loading,
    init: initChatBootstrap,
    initChatBootstrap,
    loadSessions,
    loadFriends,
    refreshOnlineStatuses,
    loadFriendRequests,
    loadGroups,
    setCurrentSession,
    clearCurrentSession: sessionStore.clearCurrentSession,
    setSessionPinned: sessionStore.setSessionPinned,
    toggleSessionPinned: sessionStore.toggleSessionPinned,
    createOrGetSession: (
      type: "private" | "group",
      targetId: string,
      targetName?: string,
      targetAvatar?: string,
    ) =>
      type === "group"
        ? sessionStore.ensureGroupSession({
            id: targetId,
            groupName: targetName,
            avatar: targetAvatar,
            memberCount: 0,
          } as Group)
        : sessionStore.ensurePrivateSession(
            targetId,
            targetName || targetId,
            targetAvatar,
          ),
    openPrivateSession,
    openGroupSession,
    loadMessages: messageStore.loadMessages,
    addMessage: messageStore.addMessage,
    sendMessage,
    deleteMessage: messageStore.deleteMessage,
    clearMessages: messageStore.clearMessages,
    markAsRead: messageStore.markAsRead,
    applyReadReceipt: messageStore.applyReadReceipt,
    searchMessages: messageStore.searchMessages,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    deleteFriend,
    updateFriendRemark,
    createGroup,
    leaveGroup,
    syncOfflineMessages,
    clear,
  };
});
