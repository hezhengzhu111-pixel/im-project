import {computed} from "vue";
import {defineStore} from "pinia";
import {useContactStore} from "@/stores/contact";
import {useGroupStore} from "@/stores/group";
import {useMessageStore} from "@/stores/message";
import {useSessionStore} from "@/stores/session";
import type {ChatSession, Group, MessageType} from "@/types";
import {logger} from "@/utils/logger";

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

export const useChatStore = defineStore("chat", () => {
  const contactStore = useContactStore();
  const groupStore = useGroupStore();
  const messageStore = useMessageStore();
  const sessionStore = useSessionStore();

  let offlineSyncTail: Promise<void> = Promise.resolve();
  let sessionRefreshTail: Promise<ChatSession[]> = Promise.resolve([]);
  let sessionRefreshInFlight: Promise<ChatSession[]> | null = null;
  let realtimeResumeTail: Promise<void> = Promise.resolve();

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

  const restoreCurrentSession = async (options?: { loadMessages?: boolean }) => {
    const shouldLoadMessages = options?.loadMessages !== false;
    const restored = sessionStore.restorePersistedCurrentSession(
      (targetId) => {
        const existing = sessionStore.sessions.find(
          (item) => item.type === "private" && String(item.targetId) === String(targetId),
        );
        if (existing) {
          return existing;
        }
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
        const existing = sessionStore.sessions.find(
          (item) => item.type === "group" && String(item.targetId) === String(targetId),
        );
        if (existing) {
          return existing;
        }
        const group = groupStore.groups.find((item) => String(item.id) === String(targetId));
        return group ? sessionStore.ensureGroupSession(group) : null;
      },
    );

    if (restored && shouldLoadMessages) {
      await messageStore.loadMessages(restored.id);
    }
    return restored;
  };

  const runBackgroundTask = (task: () => Promise<void>) => {
    void task().catch((error) => {
      logger.warn("chat background task failed", error);
    });
  };

  const warnBootstrapStep = (step: string, error: unknown) => {
    logger.warn(`chat bootstrap step failed: ${step}`, error);
  };

  const initChatBootstrap = async () => {
    let initialSessions: ChatSession[] = [];
    try {
      initialSessions = await refreshSessionSkeletons({ force: true, refreshPresence: false });
    } catch (error) {
      warnBootstrapStep("initial session skeleton refresh", error);
    }

    let restored: ChatSession | null = null;
    try {
      restored = await restoreCurrentSession({ loadMessages: true });
    } catch (error) {
      warnBootstrapStep("restore current session", error);
    }

    if (!restored && !sessionStore.currentSession) {
      try {
        await selectFirstAvailableSession(initialSessions, { loadMessages: true });
      } catch (error) {
        warnBootstrapStep("select first session", error);
      }
    }

    runBackgroundTask(async () => {
      const preloadResults = await Promise.allSettled([
        contactStore.loadFriends(),
        groupStore.loadGroups(),
        contactStore.loadFriendRequests(),
      ]);
      preloadResults.forEach((result, index) => {
        if (result.status !== "rejected") {
          return;
        }
        const step =
          index === 0
            ? "load friends"
            : index === 1
              ? "load groups"
              : "load friend requests";
        warnBootstrapStep(step, result.reason);
      });
      sessionStore.mergeGroupMetadata(groupStore.groups);

      try {
        await refreshSessionSkeletons({ force: true, refreshPresence: false });
      } catch (error) {
        warnBootstrapStep("background session skeleton refresh", error);
      }

      let restored = sessionStore.currentSession;
      if (!restored) {
        try {
          restored = await restoreCurrentSession({
            loadMessages: false,
          });
        } catch (error) {
          warnBootstrapStep("background restore current session", error);
          restored = null;
        }
      }

      if (!restored) {
        try {
          restored = await selectFirstAvailableSession(sessionStore.sortedSessions, {
            loadMessages: false,
          });
        } catch (error) {
          warnBootstrapStep("background select first session", error);
          restored = null;
        }
      }

      if (restored?.id && !messageStore.messages.has(restored.id)) {
        try {
          await messageStore.loadMessages(restored.id);
        } catch (error) {
          warnBootstrapStep("load restored session messages", error);
        }
      }

      try {
        await scheduleRealtimeResume({ forceSessionRefresh: false });
      } catch (error) {
        warnBootstrapStep("resume realtime sync", error);
      }
    });
  };

  const refreshSessionSkeletons = async (options?: {
    force?: boolean;
    refreshPresence?: boolean;
  }) => {
    if (sessionRefreshInFlight) {
      return sessionRefreshInFlight;
    }

    const run = async () => {
      const loaded = await sessionStore.loadSessions(groupStore.groups, {
        force: options?.force,
      });
      if (options?.refreshPresence) {
        await refreshOnlineStatuses();
      }
      return loaded;
    };

    const queued = sessionRefreshTail.catch(() => []).then(run);
    sessionRefreshTail = queued.then(
      (result) => result,
      () => [],
    );
    sessionRefreshInFlight = queued.finally(() => {
      sessionRefreshInFlight = null;
    });
    return sessionRefreshInFlight;
  };

  const setCurrentSession = async (session: ChatSession) => {
    sessionStore.setCurrentSession(session);
    await messageStore.loadMessages(session.id);
  };

  const selectFirstAvailableSession = async (
    sessions: ChatSession[],
    options?: { loadMessages?: boolean },
  ): Promise<ChatSession | null> => {
    if (sessionStore.currentSession) {
      return sessionStore.currentSession;
    }
    const firstSession = sessionStore.sortedSessions[0] || sessions[0];
    if (!firstSession) {
      return null;
    }
    if (options?.loadMessages === false) {
      sessionStore.setCurrentSession(firstSession);
      return sessionStore.currentSession;
    }
    await setCurrentSession(firstSession);
    return sessionStore.currentSession;
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
    await refreshSessionSkeletons({ force: true, refreshPresence: true });
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

  const searchUsers = async (params: { type: string; keyword: string }) =>
    contactStore.searchUsers(params);

  const sendFriendRequest = async (params: { userId: string; message: string }) =>
    contactStore.sendFriendRequest(params);

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
    const refreshedGroup = groupStore.groups.find((item) => item.id === created.id) || created;
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
  ) => messageStore.sendMessage(sessionStore.currentSession, content, type, extra);

  const loadMoreHistory = async (sessionId: string, size = 20) => {
    await messageStore.loadMoreHistory(sessionId, size);
  };

  const toggleSessionMuted = (sessionId: string, muted?: boolean) => {
    sessionStore.toggleSessionMuted(sessionId, muted);
  };

  const deleteSession = (sessionId: string) => {
    sessionStore.removeSession(sessionId);
    messageStore.resetSessionRuntimeState(sessionId);
  };

  const syncOfflineMessages = async (options?: {
    refreshSessions?: boolean;
    batchSize?: number;
    batchDelayMs?: number;
    loadSize?: number;
    excludeSessionIds?: string[];
  }) => {
    const refreshSessions = options?.refreshSessions !== false;
    const batchSize = Math.max(1, options?.batchSize ?? 3);
    const batchDelayMs = Math.max(0, options?.batchDelayMs ?? 150);
    const loadSize = Math.max(20, Math.min(options?.loadSize ?? 50, 100));
    const excludedSessionIds = new Set(
      (options?.excludeSessionIds || []).map((item) => String(item || "")),
    );

    const run = async () => {
      if (refreshSessions) {
        await refreshSessionSkeletons({ force: false, refreshPresence: false });
      }

      const queue: string[] = [];
      const seen = new Set<string>();
      const enqueue = (sessionId?: string) => {
        const normalizedId = String(sessionId || "").trim();
        if (!normalizedId || excludedSessionIds.has(normalizedId) || seen.has(normalizedId)) {
          return;
        }
        seen.add(normalizedId);
        queue.push(normalizedId);
      };

      enqueue(sessionStore.currentSession?.id);
      sessionStore.sessions
        .filter((session) => (session.unreadCount || 0) > 0)
        .forEach((session) => {
          enqueue(session.id);
        });

      if (queue.length === 0) {
        return;
      }

      const [currentSessionId, ...restSessionIds] = queue;
      if (currentSessionId) {
        await messageStore.loadMessages(currentSessionId, 0, loadSize);
      }

      for (let index = 0; index < restSessionIds.length; index += batchSize) {
        const batch = restSessionIds.slice(index, index + batchSize);
        await Promise.all(
          batch.map((sessionId) => messageStore.loadMessages(sessionId, 0, loadSize)),
        );
        if (index + batchSize < restSessionIds.length && batchDelayMs > 0) {
          await sleep(batchDelayMs);
        }
      }
    };

    const queuedRun = offlineSyncTail.catch(() => undefined).then(run);
    offlineSyncTail = queuedRun.then(
      () => undefined,
      () => undefined,
    );
    return queuedRun;
  };

  const scheduleRealtimeResume = async (options?: {
    forceSessionRefresh?: boolean;
  }) => {
    const run = async () => {
      await refreshSessionSkeletons({
        force: options?.forceSessionRefresh,
        refreshPresence: false,
      });
      await refreshOnlineStatuses();
      await syncOfflineMessages({
        refreshSessions: false,
        batchSize: 3,
        batchDelayMs: 150,
        loadSize: 50,
      });
    };

    const queued = realtimeResumeTail.catch(() => undefined).then(run);
    realtimeResumeTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
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
    loadingHistoryBySession: computed(() => messageStore.loadingHistoryBySession),
    hasMoreHistoryBySession: computed(() => messageStore.hasMoreHistoryBySession),
    oldestLoadedServerMessageIdBySession: computed(
      () => messageStore.oldestLoadedServerMessageIdBySession,
    ),
    friends: computed(() => contactStore.friends),
    friendRequests: computed(() => contactStore.friendRequests),
    groups: computed(() => groupStore.groups),
    loading,
    init: initChatBootstrap,
    initChatBootstrap,
    loadSessions,
    loadFriends,
    refreshOnlineStatuses,
    refreshSessionSkeletons,
    loadFriendRequests,
    loadGroups,
    setCurrentSession,
    clearCurrentSession: sessionStore.clearCurrentSession,
    setSessionPinned: sessionStore.setSessionPinned,
    toggleSessionPinned: sessionStore.toggleSessionPinned,
    setSessionMuted: sessionStore.setSessionMuted,
    toggleSessionMuted,
    deleteSession,
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
        : sessionStore.ensurePrivateSession(targetId, targetName || targetId, targetAvatar),
    openPrivateSession,
    openGroupSession,
    loadMessages: messageStore.loadMessages,
    loadMoreHistory,
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
    scheduleRealtimeResume,
    clear,
  };
});
