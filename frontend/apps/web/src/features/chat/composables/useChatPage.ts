import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { aiService } from "@/services/ai";
import { groupService } from "@/services/group";
import { useChatStore } from "@/stores/chat";
import { useI18nStore } from "@/stores/i18n";
import { useMomentsStore } from "@/stores/moments";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import { getAvatarText } from "@/utils/common";
import type {
  ChatSession,
  Friend,
  Group,
  GroupMember,
  GroupReadUser,
  Message,
} from "@/types";

export function useChatPage() {
  const userStore = useUserStore();
  const chatStore = useChatStore();
  const webSocketStore = useWebSocketStore();
  const momentsStore = useMomentsStore();
  const router = useRouter();
  const route = useRoute();
  const { capture } = useErrorHandler("chat-container");
  const { t } = useI18nStore();

  // --- UI state ---
  const activeTab = ref<"chat" | "contacts" | "moments">("chat");
  const showAddFriend = ref(false);
  const showCreateGroup = ref(false);
  const showGroupReadDialog = ref(false);
  const showSearchDialog = ref(false);
  const showSessionInfoDrawer = ref(false);
  const showDetailPanel = ref(false);
  const showSecurityPanel = ref(false);
  const isDarkTheme = ref(document.body.classList.contains("theme-dark"));
  const groupReadUsers = ref<GroupReadUser[]>([]);
  const sessionInfoMembers = ref<GroupMember[]>([]);
  const sessionInfoLoading = ref(false);
  const sessionInfoError = ref("");
  const unreadSnapshotBySession = ref(new Map<string, number>());
  const composerMembers = ref<
    { userId: string; name: string; avatar?: string; avatarText: string }[]
  >([]);
  const autoReplyEnabled = ref(false);

  // --- Derived state ---
  const currentSession = computed(() => chatStore.currentSession);
  const momentsUnreadCount = computed(() => momentsStore.unreadCount);

  const loadingMoreHistory = computed(() => {
    const sessionId = currentSession.value?.id;
    return sessionId
      ? chatStore.loadingHistoryBySession.get(sessionId) || false
      : false;
  });
  const currentSessionHasMoreHistory = computed(() => {
    const sessionId = currentSession.value?.id;
    return sessionId
      ? chatStore.hasMoreHistoryBySession.get(sessionId) !== false
      : false;
  });
  const pendingRequestsCount = computed(
    () =>
      chatStore.friendRequests.filter((item) => item.status === "PENDING")
        .length,
  );
  const isChatActiveOnMobile = computed(() => Boolean(currentSession.value));
  const currentSessionOnline = computed(() => {
    if (currentSession.value?.type !== "private") return false;
    return webSocketStore.isUserOnline(
      String(currentSession.value.targetId || ""),
    );
  });
  const connectionStatus = computed(() => webSocketStore.connectionStatus);
  const connectionStatusLabel = computed(() => {
    switch (connectionStatus.value) {
      case "connected":
        return t("chat.connected");
      case "connecting":
        return t("chat.connecting");
      default:
        return t("chat.offline");
    }
  });
  const sessionInfoFriend = computed(() => {
    if (currentSession.value?.type !== "private") return null;
    return (
      chatStore.friends.find(
        (item) =>
          String(item.friendId) === String(currentSession.value?.targetId),
      ) || null
    );
  });
  const sessionInfoGroup = computed(() => {
    if (currentSession.value?.type !== "group") return null;
    return (
      chatStore.groups.find(
        (item) => String(item.id) === String(currentSession.value?.targetId),
      ) || {
        id: currentSession.value.targetId,
        groupName: currentSession.value.targetName,
        avatar: currentSession.value.targetAvatar,
        ownerId: "",
        memberCount: currentSession.value.memberCount || 0,
        createTime: "",
      }
    );
  });
  const currentSessionUnreadSnapshot = computed(() => {
    const sessionId = currentSession.value?.id;
    if (!sessionId) return 0;
    return unreadSnapshotBySession.value.get(sessionId) || 0;
  });
  const headerAvatar = computed(
    () =>
      currentSession.value?.targetAvatar ||
      sessionInfoFriend.value?.avatar ||
      sessionInfoGroup.value?.avatar ||
      "",
  );
  const headerAvatarText = computed(() =>
    getAvatarText(
      currentSession.value?.targetName || currentSession.value?.targetId,
    ),
  );
  const groupMemberCount = computed(() => {
    if (currentSession.value?.type !== "group") return 0;
    if (sessionInfoMembers.value.length > 0)
      return sessionInfoMembers.value.length;
    return (
      sessionInfoGroup.value?.memberCount ||
      currentSession.value.memberCount ||
      0
    );
  });
  const humanIntervention = computed(() => {
    const session = currentSession.value;
    if (!session?.lastMessage) return false;
    const msg = session.lastMessage;
    if (msg.messageType === "SYSTEM" && msg.content?.includes("接管"))
      return true;
    return false;
  });
  const lastAiReplyInfo = computed(() => {
    const session = currentSession.value;
    if (!session?.lastMessage?.isAiGenerated) return null;
    const msg = session.lastMessage;
    return { time: msg.sendTime, provider: msg.aiProvider, model: msg.aiModel };
  });

  // --- Helpers ---
  const rememberUnreadSnapshot = (session?: ChatSession | null) => {
    if (!session?.id) return;
    unreadSnapshotBySession.value.set(
      session.id,
      Math.max(0, session.unreadCount || 0),
    );
  };

  const fetchComposerMembers = async (groupId: string) => {
    try {
      const response = await groupService.getMembers(groupId);
      const members = (response.data || []) as GroupMember[];
      composerMembers.value = members.map((m) => ({
        userId: String(m.userId || ""),
        name: m.nickname || m.username || String(m.userId),
        avatar: m.avatar,
        avatarText: getAvatarText(m.nickname || m.username || String(m.userId)),
      }));
    } catch {
      composerMembers.value = [];
    }
  };

  const formatDetailTime = (time?: string) => {
    if (!time) return "";
    const d = new Date(time);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const fetchAutoReplyStatus = async () => {
    try {
      const response = await aiService.getSettings();
      autoReplyEnabled.value = response.data.autoReplyEnabled;
    } catch {
      /* ignore */
    }
  };

  // --- Actions ---
  const handleTabChange = (tabName: "chat" | "contacts" | "moments") => {
    if (tabName === "moments") {
      router.push("/moments");
      return;
    }
    activeTab.value = tabName;
  };

  const selectSession = async (
    session: NonNullable<typeof currentSession.value>,
  ) => {
    rememberUnreadSnapshot(session);
    if (currentSession.value?.id === session.id) {
      await chatStore.markAsRead(session.id);
      return;
    }
    await chatStore.setCurrentSession(session);
    await chatStore.markAsRead(session.id);
  };

  const startChat = async (contact: Friend) => {
    const session = await chatStore.openPrivateSession({
      targetId: contact.friendId,
      targetName:
        contact.remark ||
        contact.nickname ||
        contact.username ||
        contact.friendId,
      targetAvatar: contact.avatar,
    });
    if (session) {
      rememberUnreadSnapshot(session);
      activeTab.value = "chat";
    }
  };

  const startGroupChat = async (group: Group) => {
    const session = await chatStore.openGroupSession(group);
    if (session) {
      rememberUnreadSnapshot(session);
      activeTab.value = "chat";
    }
  };

  const refreshSessionMembers = async (groupId: string) => {
    sessionInfoLoading.value = true;
    sessionInfoError.value = "";
    try {
      const response = await groupService.getMembers(groupId);
      const members = response.data || [];
      const memberIds = members
        .map((member) => String(member.userId || ""))
        .filter(Boolean);
      const onlineStatus = await webSocketStore.refreshOnlineStatus(memberIds);
      sessionInfoMembers.value = members.map((member) => ({
        ...member,
        online:
          String(member.userId) === String(userStore.userId || "") ||
          Boolean(onlineStatus[String(member.userId || "")]) ||
          webSocketStore.isUserOnline(String(member.userId || "")),
      }));
    } catch (error) {
      sessionInfoError.value = t("chat.loadGroupFailed");
      capture(error, t("chat.loadGroupFailed"));
    } finally {
      sessionInfoLoading.value = false;
    }
  };

  const openSessionInfoDrawer = async (session: ChatSession) => {
    showSessionInfoDrawer.value = true;
    sessionInfoMembers.value = [];
    sessionInfoError.value = "";
    sessionInfoLoading.value = false;
    if (session.type !== "group") return;
    await refreshSessionMembers(session.targetId);
  };

  const handleSessionAction = async (command: string | number | object) => {
    const session = currentSession.value;
    if (typeof command !== "string" || !session?.id) return;
    try {
      switch (command) {
        case "search-messages":
          showSearchDialog.value = true;
          await chatStore.searchMessages("", session.id);
          return;
        case "toggle-pin":
          chatStore.toggleSessionPinned(session.id);
          return;
        case "toggle-mute":
          chatStore.toggleSessionMuted(session.id);
          return;
        case "open-session-info":
          showDetailPanel.value = !showDetailPanel.value;
          await openSessionInfoDrawer(session);
          return;
        case "clear-history":
          await ElMessageBox.confirm(
            t("chat.clearHistoryMessage", { name: session.targetName }),
            t("chat.clearHistoryTitle"),
            {
              type: "warning",
              confirmButtonText: t("common.confirm"),
              cancelButtonText: t("common.cancel"),
            },
          );
          await chatStore.clearMessages(session.id);
          unreadSnapshotBySession.value.set(session.id, 0);
          return;
        case "delete-session":
          await ElMessageBox.confirm(
            t("chat.removeMessage", { name: session.targetName }),
            t("chat.removeTitle"),
            {
              type: "warning",
              confirmButtonText: t("common.confirm"),
              cancelButtonText: t("common.cancel"),
            },
          );
          unreadSnapshotBySession.value.delete(session.id);
          chatStore.deleteSession(session.id);
          showSearchDialog.value = false;
          showSessionInfoDrawer.value = false;
          return;
        default:
          return;
      }
    } catch (error) {
      if (error !== "cancel" && error !== "close") {
        capture(error, "Failed to handle session action");
      }
    }
  };

  const sendTextMessage = async (
    content: string,
    mentionedUserIds?: string[],
  ) => {
    await chatStore.sendMessage(content, "TEXT", undefined, mentionedUserIds);
  };

  const sendMediaMessage = async (payload: {
    type: "IMAGE" | "FILE" | "VIDEO" | "VOICE";
    url: string;
    extra?: Record<string, unknown>;
  }) => {
    await chatStore.sendMessage(payload.url, payload.type, payload.extra);
  };

  const handleRequestMembers = () => {
    const session = currentSession.value;
    if (session?.type === "group") {
      fetchComposerMembers(session.targetId);
    }
  };

  const loadMoreHistory = async () => {
    if (
      !currentSession.value?.id ||
      loadingMoreHistory.value ||
      !currentSessionHasMoreHistory.value
    )
      return;
    await chatStore.loadMoreHistory(currentSession.value.id);
  };

  const openGroupReadDialog = (message: Message) => {
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    const userNameMap = new Map<string, string>();
    const currentUserId = String(userStore.userId || "");
    if (currentUserId) {
      userNameMap.set(
        currentUserId,
        userStore.userInfo?.nickname ||
          userStore.userInfo?.username ||
          userStore.nickname ||
          currentUserId,
      );
    }
    chatStore.friends.forEach((friend) => {
      userNameMap.set(
        friend.friendId,
        friend.remark || friend.nickname || friend.username || friend.friendId,
      );
    });
    chatStore.currentMessages.forEach((item) => {
      if (item.senderName) userNameMap.set(item.senderId, item.senderName);
    });
    groupReadUsers.value = Array.from(new Set(readBy)).map((userId) => ({
      userId,
      displayName: userNameMap.get(userId) || `User ${userId}`,
    }));
    showGroupReadDialog.value = true;
  };

  const tryAckRead = async () => {
    if (document.hidden || !currentSession.value?.id) return;
    await chatStore.markAsRead(currentSession.value.id);
  };

  const toggleTheme = () => {
    isDarkTheme.value = !isDarkTheme.value;
    document.body.classList.toggle("theme-dark", isDarkTheme.value);
    localStorage.setItem("im_theme", isDarkTheme.value ? "dark" : "light");
  };

  const toggleAutoReply = async () => {
    const next = !autoReplyEnabled.value;
    try {
      await aiService.updateSettings({ autoReplyEnabled: next });
      autoReplyEnabled.value = next;
    } catch (err) {
      capture(err, "Failed to toggle auto-reply");
    }
  };

  // --- Watchers ---
  watch(
    () => currentSession.value,
    (session) => {
      if (session?.type === "group") {
        fetchComposerMembers(session.targetId);
      } else {
        composerMembers.value = [];
      }
    },
    { immediate: true },
  );

  watch(
    () => currentSession.value,
    (session) => {
      if (session?.id && !unreadSnapshotBySession.value.has(session.id)) {
        rememberUnreadSnapshot(session);
      }
      if (!session?.id) {
        showSessionInfoDrawer.value = false;
        showSearchDialog.value = false;
      }
    },
    { immediate: true },
  );

  watch(
    () => route.path,
    (path) => {
      if (path.startsWith("/moments")) {
        activeTab.value = "moments";
      }
    },
    { immediate: true },
  );

  // --- Lifecycle ---
  const onFocus = () => void tryAckRead();
  const onVisibility = () => {
    if (!document.hidden) void tryAckRead();
  };

  onMounted(() => {
    fetchAutoReplyStatus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  });

  return {
    // stores
    userStore,
    chatStore,
    webSocketStore,
    t,
    // UI state
    activeTab,
    showAddFriend,
    showCreateGroup,
    showGroupReadDialog,
    showSearchDialog,
    showSessionInfoDrawer,
    showDetailPanel,
    showSecurityPanel,
    isDarkTheme,
    groupReadUsers,
    sessionInfoMembers,
    sessionInfoLoading,
    sessionInfoError,
    unreadSnapshotBySession,
    composerMembers,
    autoReplyEnabled,
    // derived
    currentSession,
    loadingMoreHistory,
    currentSessionHasMoreHistory,
    pendingRequestsCount,
    momentsUnreadCount,
    isChatActiveOnMobile,
    currentSessionOnline,
    connectionStatus,
    connectionStatusLabel,
    sessionInfoFriend,
    sessionInfoGroup,
    currentSessionUnreadSnapshot,
    headerAvatar,
    headerAvatarText,
    groupMemberCount,
    humanIntervention,
    lastAiReplyInfo,
    formatDetailTime,
    // actions
    handleTabChange,
    selectSession,
    startChat,
    startGroupChat,
    openSessionInfoDrawer,
    refreshSessionMembers,
    handleSessionAction,
    sendTextMessage,
    sendMediaMessage,
    handleRequestMembers,
    loadMoreHistory,
    openGroupReadDialog,
    tryAckRead,
    toggleTheme,
    toggleAutoReply,
  };
}
