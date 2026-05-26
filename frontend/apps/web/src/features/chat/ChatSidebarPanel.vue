<template>
  <!-- 会话列表 (chat tab) -->
  <div v-if="activeTab === 'chat'" class="session-list" v-loading="!!loading">
    <div
      v-for="session in sessions"
      :key="session.id"
      class="session-item"
      :class="{ 'session-item--active': session.id === activeSessionId }"
      @click="handleSelectSession(session)"
    >
      <el-badge :hidden="!session.unreadCount" is-dot>
        <el-avatar :src="session.avatar" :size="40" />
      </el-badge>
      <div class="session-info">
        <div class="session-top">
          <span class="session-name">{{ session.name }}</span>
          <span class="session-time">{{ formatTime(session.lastMessageTime) }}</span>
        </div>
        <div class="session-preview">
          <span class="session-last-msg">{{ session.lastMessage?.content || '' }}</span>
        </div>
      </div>
    </div>
    <div v-if="sessions.length === 0 && !loading" class="session-empty">
      <p>暂无会话</p>
    </div>
  </div>

  <!-- 联系人列表 (contacts tab) -->
  <div v-else-if="activeTab === 'contacts'" class="contact-list">
    <div class="contact-section">
      <div
        v-for="friend in friends"
        :key="friend.friendId"
        class="contact-item"
        @click="handleStartPrivateChat(friend)"
      >
        <el-avatar :src="friend.avatar" :size="40" />
        <div class="contact-info">
          <span class="contact-name">{{ friend.nickname || friend.username }}</span>
          <span class="contact-status" :class="{ online: friend.isOnline }">
            {{ friend.isOnline ? '在线' : '离线' }}
          </span>
        </div>
      </div>
      <div v-if="friends.length === 0" class="session-empty">
        <p>暂无联系人</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18nStore } from "@/stores/i18n";
import { useWebSocketStore } from "@/stores/websocket";
import type { ChatSession, Friend, Group } from "@/types";

interface Props {
  sessions: ChatSession[];
  loading?: boolean;
  activeSessionId?: string;
  friends: Friend[];
  groups: Group[];
  pendingRequestsCount: number;
  totalUnreadCount: number;
  momentsUnreadCount?: number;
  isChatActiveOnMobile: boolean;
  sessionsLoading?: boolean;
  searchKeyword?: string;
  activeTab: "chat" | "contacts" | "moments";
  currentSessionId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  currentSessionId: "",
  searchKeyword: "",
});

const emit = defineEmits<{
  (e: "select", sessionId: string): void;
  (e: "change-tab", tab: "chat" | "contacts" | "moments"): void;
  (e: "select-session", session: ChatSession): void;
  (e: "start-private-chat", contact: Friend): void;
  (e: "start-group-chat", group: Group): void;
  (e: "open-add-friend"): void;
  (e: "open-create-group"): void;
  (e: "open-settings"): void;
}>();

const webSocketStore = useWebSocketStore();
const { locale, t } = useI18nStore();
const localSearchKeyword = ref(props.searchKeyword);
const debouncedSearchKeyword = ref(props.searchKeyword.trim().toLowerCase());
const resolvePinyinInitial = ref<((value: string) => string) | null>(null);
const searchDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const sessionFilterCache = new Map<
  string,
  { sourceKey: string; preview: string; searchText: string; online: boolean }
>();
const contactFilterCache = new Map<
  string,
  { sourceKey: string; searchText: string; initial: string }
>();
const groupFilterCache = new Map<
  string,
  { sourceKey: string; searchText: string }
>();

const normalizedSearchKeyword = computed(() => debouncedSearchKeyword.value);

const panelTitle = computed(() => {
  if (props.activeTab === "contacts") {
    return t("sidebar.contactsTitle");
  }
  return t("sidebar.messagesTitle");
});

const panelSubtitle = computed(() => {
  if (props.activeTab === "contacts") {
    return t("sidebar.contactsAvailable", { count: props.friends.length });
  }
  return t("sidebar.activeConversations", { count: props.sessions.length });
});

const handleChangeTab = (tab: string) => {
  if (tab === "chat" || tab === "contacts" || tab === "moments") {
    emit("change-tab", tab);
  }
};

const handleOpenSettings = () => {
  emit("open-settings");
};

const handleOpenAddFriend = () => {
  emit("open-add-friend");
};

const handleOpenCreateGroup = () => {
  emit("open-create-group");
};

const handleSelectSession = (session: ChatSession) => {
  emit("select-session", session);
};

const handleStartPrivateChat = (contact: Friend) => {
  emit("start-private-chat", contact);
};

const handleStartGroupChat = (group: Group) => {
  emit("start-group-chat", group);
};

watch(
  () => props.searchKeyword,
  (value) => {
    localSearchKeyword.value = value;
  },
);

watch(
  localSearchKeyword,
  (value) => {
    if (searchDebounceTimer.value) {
      clearTimeout(searchDebounceTimer.value);
    }
    searchDebounceTimer.value = setTimeout(() => {
      debouncedSearchKeyword.value = value.trim().toLowerCase();
      searchDebounceTimer.value = null;
    }, 150);
  },
  { immediate: true },
);

watch(
  () => props.activeTab,
  async (tab) => {
    if (tab !== "contacts" || resolvePinyinInitial.value) {
      return;
    }
    const { pinyin } = await import("pinyin-pro");
    resolvePinyinInitial.value = (value: string) =>
      pinyin(value, {
        pattern: "first",
        toneType: "none",
      }).toUpperCase();
    contactFilterCache.clear();
  },
  { immediate: true },
);

onUnmounted(() => {
  if (searchDebounceTimer.value) {
    clearTimeout(searchDebounceTimer.value);
  }
  sessionFilterCache.clear();
  contactFilterCache.clear();
  groupFilterCache.clear();
});

const formatTime = (time?: string) => {
  if (!time) {
    return "";
  }
  const date = new Date(time);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) {
    return t("sidebar.justNow");
  }
  if (diff < 3_600_000) {
    return t("sidebar.minutesAgo", { count: Math.floor(diff / 60_000) });
  }
  if (diff < 86_400_000) {
    return t("sidebar.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  }
  return date.toLocaleDateString(locale.value, {
    month: "numeric",
    day: "numeric",
  });
};

const previewMessage = (message?: ChatSession["lastMessage"]) => {
  if (!message) {
    return "";
  }
  switch (message.messageType) {
    case "IMAGE":
      return t("sidebar.image");
    case "FILE":
      return message.mediaName
        ? `${t("sidebar.file")} ${message.mediaName}`
        : t("sidebar.file");
    case "VOICE":
      return t("sidebar.voice");
    case "VIDEO":
      return t("sidebar.video");
    case "SYSTEM":
      return message.content || t("sidebar.system");
    default:
      return message.content || "";
  }
};

const isSessionOnline = (session: ChatSession) =>
  session.type === "private" &&
  webSocketStore.isUserOnline(String(session.targetId || ""));

const sessionPreview = (session: ChatSession, online: boolean) => {
  const messagePreview = previewMessage(session.lastMessage);
  if (messagePreview) {
    return messagePreview;
  }
  if (session.type === "private") {
    return online ? t("sidebar.availableNow") : t("sidebar.noRecentMessages");
  }
  if (session.memberCount && session.memberCount > 0) {
    return t("sidebar.members", { count: session.memberCount });
  }
  return t("sidebar.noRecentMessages");
};

const getSessionCacheEntry = (session: ChatSession) => {
  const sessionId = session.id;
  const online = isSessionOnline(session);
  const preview = sessionPreview(session, online);
  const sourceKey = [
    session.id,
    session.targetName,
    session.targetId,
    session.lastMessage?.id || "",
    session.lastMessage?.content || "",
    session.unreadCount,
    session.isPinned ? 1 : 0,
    session.isMuted ? 1 : 0,
    session.memberCount || 0,
    session.lastActiveTime,
    online ? 1 : 0,
    locale.value,
  ].join("|");
  const cached = sessionFilterCache.get(sessionId);
  if (cached?.sourceKey === sourceKey) {
    return cached;
  }

  const next = {
    sourceKey,
    preview,
    searchText: [
      session.targetName,
      preview,
      session.conversationName,
      session.targetId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    online,
  };
  sessionFilterCache.set(sessionId, next);
  return next;
};

const sessionItems = computed(() =>
  props.sessions.map((session) => {
    const cached = getSessionCacheEntry(session);
    return {
      session,
      online: cached.online,
      preview: cached.preview,
      searchText: cached.searchText,
      isAi: Boolean(session.lastMessage?.isAiGenerated),
    };
  }),
);

const filteredSessionItems = computed(() => {
  if (!normalizedSearchKeyword.value) {
    return sessionItems.value;
  }
  return sessionItems.value.filter((item) =>
    item.searchText.includes(normalizedSearchKeyword.value),
  );
});

const resolveContactInitial = (name: string) => {
  let initial = name.charAt(0).toUpperCase();
  if (/[\u4e00-\u9fa5]/.test(initial) && resolvePinyinInitial.value) {
    initial = resolvePinyinInitial.value(initial);
  }
  if (!/[A-Z]/.test(initial)) {
    initial = "#";
  }
  return initial;
};

const getContactCacheEntry = (contact: Friend) => {
  const contactId = contact.friendId;
  const displayName =
    contact.nickname || contact.username || contact.friendId || "";
  const sourceKey = [
    contact.friendId,
    contact.nickname,
    contact.username,
    contact.remark,
  ].join("|");
  const cached = contactFilterCache.get(contactId);
  if (cached?.sourceKey === sourceKey) {
    return cached;
  }

  const next = {
    sourceKey,
    searchText: [
      contact.nickname,
      contact.username,
      contact.friendId,
      contact.remark,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    initial: resolveContactInitial(displayName),
  };
  contactFilterCache.set(contactId, next);
  return next;
};

const filteredContacts = computed(() => {
  if (!normalizedSearchKeyword.value) {
    return props.friends;
  }
  return props.friends.filter((contact) =>
    getContactCacheEntry(contact).searchText.includes(
      normalizedSearchKeyword.value,
    ),
  );
});

const groupedContacts = computed(() => {
  const groups = new Map<string, Friend[]>();
  filteredContacts.value.forEach((contact) => {
    const firstChar = getContactCacheEntry(contact).initial;
    groups.set(firstChar, [...(groups.get(firstChar) || []), contact]);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === "#") return 1;
      if (right === "#") return -1;
      return left.localeCompare(right);
    })
    .map(([key, contacts]) => ({ key, contacts }));
});

const getGroupCacheEntry = (group: Group) => {
  const groupId = String(group.id);
  const sourceKey = [
    group.id,
    group.groupName,
    group.name,
    group.memberCount || 0,
  ].join("|");
  const cached = groupFilterCache.get(groupId);
  if (cached?.sourceKey === sourceKey) {
    return cached;
  }
  const next = {
    sourceKey,
    searchText: [group.groupName, group.name, group.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
  groupFilterCache.set(groupId, next);
  return next;
};

const filteredGroups = computed(() => {
  if (!normalizedSearchKeyword.value) {
    return props.groups;
  }
  return props.groups.filter((group) =>
    getGroupCacheEntry(group).searchText.includes(
      normalizedSearchKeyword.value,
    ),
  );
});
</script>

<style scoped lang="scss">
.session-list {
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
  &::-webkit-scrollbar-track { background: transparent; }
}

.session-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: background var(--motion-fast);
  height: 64px;

  &:hover { background: var(--chat-card-hover); }
  &--active { background: var(--chat-card-active); }
}

.session-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 4px;
}

.session-top {
  display: flex; justify-content: space-between; align-items: baseline;
}

.session-name {
  font-size: var(--font-size-base); color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;
}

.session-time {
  font-size: var(--font-size-xs); color: var(--text-tertiary);
  flex-shrink: 0; margin-left: var(--space-2);
}

.session-last-msg {
  font-size: var(--font-size-sm); color: var(--text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.session-empty {
  display: flex; justify-content: center; padding: var(--space-8);
  color: var(--text-tertiary); font-size: var(--font-size-sm);
}

// ── 联系人列表 ──
.contact-list {
  flex: 1; overflow-y: auto;
}

.contact-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4); cursor: pointer;
  transition: background var(--motion-fast); height: 60px;

  &:hover { background: var(--chat-card-hover); }
}

.contact-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}

.contact-name {
  font-size: var(--font-size-base); color: var(--text-primary);
}

.contact-status {
  font-size: var(--font-size-xs); color: var(--text-tertiary);

  &.online { color: var(--color-primary); }
}
</style>
