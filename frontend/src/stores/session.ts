import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { messageService } from "@/services/message";
import { buildSessionId, normalizeConversation } from "@/normalizers/chat";
import type { ChatSession, ChatSessionType, Group, Message } from "@/types";
import { useUserStore } from "@/stores/user";

const CURRENT_SESSION_STORAGE_KEY = "im_current_session";

const normalizeSessionTime = (value?: string): string => {
  if (!value) {
    return "";
  }
  const next = new Date(value).getTime();
  return Number.isFinite(next) ? value : "";
};

const withLegacySessionAliases = (session: ChatSession): ChatSession => ({
  ...session,
  name: session.targetName,
  avatar: session.targetAvatar,
  conversationType: session.type === "group" ? "GROUP" : "PRIVATE",
  pinned: session.isPinned,
});

export const useSessionStore = defineStore("session", () => {
  const currentSession = ref<ChatSession | null>(null);
  const sessions = ref<ChatSession[]>([]);
  const unreadCounts = ref<Map<string, number>>(new Map());
  const loading = ref(false);

  const currentSessionId = computed(() => currentSession.value?.id || "");

  const sortedSessions = computed(() => {
    return [...sessions.value].sort((left, right) => {
      if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
        return left.isPinned ? -1 : 1;
      }
      const leftTime = new Date(left.lastActiveTime || 0).getTime();
      const rightTime = new Date(right.lastActiveTime || 0).getTime();
      return (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0);
    });
  });

  const totalUnreadCount = computed(() => {
    let total = 0;
    unreadCounts.value.forEach((count) => {
      total += count;
    });
    return total;
  });

  const persistCurrentSession = (session: ChatSession | null) => {
    if (!session) {
      localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      CURRENT_SESSION_STORAGE_KEY,
      JSON.stringify({
        type: session.type,
        targetId: session.targetId,
      }),
    );
  };

  const syncUnreadCounts = () => {
    unreadCounts.value = new Map(
      sessions.value.map((session) => [
        session.id,
        Number(session.unreadCount || 0),
      ]),
    );
  };

  const ensureSession = (session: ChatSession): ChatSession => {
    const existing = sessions.value.find((item) => item.id === session.id);
    if (existing) {
      Object.assign(existing, withLegacySessionAliases(session), {
        lastActiveTime:
          normalizeSessionTime(session.lastActiveTime) || existing.lastActiveTime,
      });
      unreadCounts.value.set(existing.id, existing.unreadCount || 0);
      return existing;
    }
    const created: ChatSession = withLegacySessionAliases({
      ...session,
      unreadCount: session.unreadCount || 0,
      lastActiveTime: normalizeSessionTime(session.lastActiveTime),
      isPinned: Boolean(session.isPinned),
      isMuted: Boolean(session.isMuted),
    });
    sessions.value.push(created);
    unreadCounts.value.set(created.id, created.unreadCount || 0);
    return created;
  };

  const ensurePrivateSession = (
    targetId: string,
    targetName: string,
    targetAvatar?: string,
  ): ChatSession | null => {
    const userStore = useUserStore();
    const currentUserId = String(userStore.userId || "");
    if (!currentUserId || !targetId) {
      return null;
    }
    return ensureSession({
      id: buildSessionId("private", currentUserId, targetId),
      type: "private",
      targetId,
      targetName: targetName || targetId,
      targetAvatar,
      unreadCount: 0,
      lastActiveTime: "",
      isPinned: false,
      isMuted: false,
    });
  };

  const ensureGroupSession = (
    target: Pick<Group, "id" | "groupName" | "name" | "avatar" | "memberCount">,
  ): ChatSession | null => {
    const groupId = String(target.id || "").trim();
    if (!groupId) {
      return null;
    }
    return ensureSession({
      id: buildSessionId("group", "", groupId),
      type: "group",
      targetId: groupId,
      targetName: target.groupName || target.name || groupId,
      targetAvatar: target.avatar,
      unreadCount: 0,
      lastActiveTime: "",
      memberCount:
        target.memberCount != null ? Number(target.memberCount) : undefined,
      isPinned: false,
      isMuted: false,
    });
  };

  const setCurrentSession = (session: ChatSession) => {
    const matched = ensureSession(session);
    currentSession.value = matched;
    if (matched.unreadCount > 0) {
      matched.unreadCount = 0;
      unreadCounts.value.set(matched.id, 0);
    }
    persistCurrentSession(matched);
  };

  const clearCurrentSession = () => {
    currentSession.value = null;
    persistCurrentSession(null);
  };

  const applyMessageToSession = (
    sessionId: string,
    message: Message,
    options?: { incrementUnread?: boolean },
  ) => {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    session.lastMessage = message;
    session.lastMessageTime = message.sendTime;
    session.lastActiveTime = message.sendTime;
    if (options?.incrementUnread) {
      session.unreadCount = (session.unreadCount || 0) + 1;
      unreadCounts.value.set(sessionId, session.unreadCount);
    }
  };

  const updatePrivateSessionDisplay = (
    targetId: string,
    targetName: string,
    targetAvatar?: string,
  ) => {
    sessions.value = sessions.value.map((session) => {
      if (session.type !== "private" || session.targetId !== targetId) {
        return session;
      }
      return withLegacySessionAliases({
        ...session,
        targetName: targetName || session.targetName,
        targetAvatar: targetAvatar || session.targetAvatar,
      });
    });
    if (
      currentSession.value?.type === "private" &&
      currentSession.value.targetId === targetId
    ) {
      currentSession.value = sessions.value.find(
        (item) => item.id === currentSession.value?.id,
      ) || currentSession.value;
    }
  };

  const setSessionPinned = (sessionId: string, pinned: boolean) => {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    session.isPinned = pinned;
    session.pinned = pinned;
    if (currentSession.value?.id === sessionId) {
      currentSession.value = {
        ...currentSession.value,
        isPinned: pinned,
        pinned,
      };
    }
  };

  const toggleSessionPinned = (sessionId: string, pinned?: boolean) => {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    setSessionPinned(sessionId, pinned ?? !session.isPinned);
  };

  const mergeGroupMetadata = (groups: Group[]) => {
    sessions.value = sessions.value.map((session) => {
      if (session.type !== "group") {
        return session;
      }
      const group = groups.find(
        (item) => String(item.id) === String(session.targetId),
      );
      if (!group) {
        return session;
      }
      return withLegacySessionAliases({
        ...session,
        targetName: group.groupName || group.name || session.targetName,
        targetAvatar: group.avatar || session.targetAvatar,
        memberCount:
          group.memberCount != null
            ? Number(group.memberCount)
            : session.memberCount,
        unreadCount: group.unreadCount ?? session.unreadCount,
        lastActiveTime:
          group.lastMessageTime || group.lastActivityAt || session.lastActiveTime,
      });
    });
    syncUnreadCounts();
  };

  const removeSession = (sessionId: string) => {
    sessions.value = sessions.value.filter((session) => session.id !== sessionId);
    unreadCounts.value.delete(sessionId);
    if (currentSession.value?.id === sessionId) {
      clearCurrentSession();
    }
  };

  const removeGroupSession = (groupId: string) => {
    const userStore = useUserStore();
    removeSession(buildSessionId("group", String(userStore.userId || ""), groupId));
  };

  const restorePersistedCurrentSession = (
    privateSessionFactory: (targetId: string) => ChatSession | null,
    groupSessionFactory: (targetId: string) => ChatSession | null,
  ): ChatSession | null => {
    try {
      const raw = localStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as {
        type?: ChatSessionType;
        targetId?: string;
      };
      if (!parsed?.type || !parsed?.targetId) {
        localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
        return null;
      }
      const session =
        parsed.type === "group"
          ? groupSessionFactory(parsed.targetId)
          : privateSessionFactory(parsed.targetId);
      if (session) {
        currentSession.value = ensureSession(session);
        return currentSession.value;
      }
    } catch {
      localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
    }
    return null;
  };

  const loadSessions = async (groups: Group[]): Promise<ChatSession[]> => {
    const userStore = useUserStore();
    const currentUserId = String(userStore.userId || "");
    if (!currentUserId) {
      sessions.value = [];
      unreadCounts.value.clear();
      return [];
    }
    loading.value = true;
    try {
      const response = await messageService.getConversations(currentUserId);
      const byId = new Map<string, ChatSession>();
      for (const session of response.data) {
        const normalized = normalizeConversation(session, currentUserId);
        const next = normalized || session;
        if (!next) {
          continue;
        }
        const existing = byId.get(next.id);
        if (
          !existing ||
          new Date(next.lastActiveTime || 0).getTime() >
            new Date(existing.lastActiveTime || 0).getTime()
        ) {
          byId.set(next.id, next);
        }
      }
      sessions.value = Array.from(byId.values()).map(withLegacySessionAliases);
      mergeGroupMetadata(groups);
      syncUnreadCounts();
      if (currentSession.value) {
        currentSession.value =
          sessions.value.find((item) => item.id === currentSession.value?.id) ||
          currentSession.value;
      }
      return sessions.value;
    } finally {
      loading.value = false;
    }
  };

  const markSessionReadLocally = (sessionId: string) => {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    session.unreadCount = 0;
    unreadCounts.value.set(session.id, 0);
  };

  const clearSessionConversationState = (sessionId: string) => {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    session.lastMessage = undefined;
    session.lastMessageTime = undefined;
    session.lastMessageSenderId = undefined;
    session.lastMessageSenderName = undefined;
    session.lastActiveTime = "";
    session.unreadCount = 0;
    unreadCounts.value.set(session.id, 0);
  };

  const clear = () => {
    clearCurrentSession();
    sessions.value = [];
    unreadCounts.value.clear();
  };

  return {
    currentSession,
    currentSessionId,
    sessions,
    unreadCounts,
    loading,
    sortedSessions,
    totalUnreadCount,
    ensureSession,
    ensurePrivateSession,
    ensureGroupSession,
    setCurrentSession,
    clearCurrentSession,
    applyMessageToSession,
    updatePrivateSessionDisplay,
    setSessionPinned,
    toggleSessionPinned,
    mergeGroupMetadata,
    removeSession,
    removeGroupSession,
    restorePersistedCurrentSession,
    loadSessions,
    markSessionReadLocally,
    clearSessionConversationState,
    clear,
  };
});
