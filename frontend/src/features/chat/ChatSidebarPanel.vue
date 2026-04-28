<template>
  <div class="chat-layout">
    <SideNavBar
      class="side-nav-bar"
      :active-tab="activeTab"
      :unread-count="totalUnreadCount"
      :pending-requests="pendingRequestsCount"
      @change-tab="handleChangeTab"
      @settings="handleOpenSettings"
    />

    <div class="list-panel" :class="{ 'hidden-mobile': isChatActiveOnMobile }">
      <div class="panel-top">
        <div class="panel-heading">
          <div class="panel-title">{{ panelTitle }}</div>
          <div class="panel-subtitle">{{ panelSubtitle }}</div>
        </div>

        <div class="search-box">
          <el-input
            v-model="localSearchKeyword"
            clearable
            :prefix-icon="Search"
            :placeholder="t('sidebar.search')"
            :aria-label="t('sidebar.searchAria')"
          />
          <div v-if="activeTab !== 'chat'" class="add-btn">
            <el-button
              v-if="activeTab === 'contacts'"
              size="small"
              :icon="Plus"
              circle
              :aria-label="t('sidebar.addFriend')"
              :title="t('sidebar.addFriend')"
              @click="handleOpenAddFriend"
            />
            <el-button
              v-if="activeTab === 'groups'"
              size="small"
              :icon="Plus"
              circle
              :aria-label="t('sidebar.createGroup')"
              :title="t('sidebar.createGroup')"
              @click="handleOpenCreateGroup"
            />
          </div>
        </div>
      </div>

      <div
        v-if="activeTab === 'contacts' && pendingRequestsCount > 0"
        class="friend-request-alert"
        @click="$router.push('/contacts')"
      >
        <el-alert
          :title="t('sidebar.pendingRequests', { count: pendingRequestsCount })"
          type="info"
          :closable="false"
          show-icon
        />
      </div>

      <div v-show="activeTab === 'chat'" class="session-list chat-soft-scrollbar" role="list">
        <button
          v-for="item in filteredSessionItems"
          :key="item.session.id"
          type="button"
          class="session-item interactive-reset"
          :class="{ active: currentSessionId === item.session.id, unread: item.session.unreadCount > 0 }"
          @click="handleSelectSession(item.session)"
        >
          <span class="session-accent"></span>
          <div class="session-avatar-wrap">
            <el-avatar :size="40" :src="item.session.targetAvatar">
              {{ item.session.targetName?.charAt(0) || "U" }}
            </el-avatar>
            <span
              v-if="item.session.type === 'private'"
              class="presence-dot"
              :class="{ online: item.online }"
            ></span>
          </div>

          <div class="session-info">
            <div class="session-header">
              <div class="session-title-wrap">
                <span class="session-name">{{ item.session.targetName }}</span>
                <span class="session-flags">
                  <el-icon
                    v-if="item.session.isPinned"
                    class="session-flag"
                    :aria-label="t('sidebar.pinnedConversation')"
                  >
                    <Top />
                  </el-icon>
                  <el-icon
                    v-if="item.session.isMuted"
                    class="session-flag"
                    :aria-label="t('sidebar.mutedConversation')"
                  >
                    <Bell />
                  </el-icon>
                </span>
              </div>
              <span class="session-time">{{ formatTime(item.session.lastActiveTime) }}</span>
            </div>

            <div class="session-meta-row">
              <span
                v-if="item.session.type === 'private'"
                class="session-presence"
                :class="{ online: item.online }"
              >
                {{ item.online ? t("sidebar.online") : t("sidebar.offline") }}
              </span>
              <span v-else class="session-presence">
                {{ t("sidebar.members", { count: item.session.memberCount || 0 }) }}
              </span>
              <span
                v-if="item.session.unreadCount > 0"
                class="unread-badge"
                :aria-label="t('sidebar.unreadMessages', { count: item.session.unreadCount })"
              >
                {{ item.session.unreadCount > 99 ? "99+" : item.session.unreadCount }}
              </span>
            </div>

            <div class="session-preview">
              {{ item.preview }}
            </div>
          </div>
        </button>
        <el-empty
          v-if="filteredSessionItems.length === 0"
          :description="t('sidebar.noConversations')"
          :image-size="60"
        />
      </div>

      <div v-show="activeTab === 'contacts'" class="contact-list chat-soft-scrollbar" role="list">
        <template v-if="groupedContacts.length > 0">
          <div
            v-for="group in groupedContacts"
            :key="group.key"
            class="contact-group"
          >
            <div class="group-header">{{ group.key }}</div>
            <button
              v-for="contact in group.contacts"
              :key="contact.friendId"
              type="button"
              class="contact-item interactive-reset"
              @click="handleStartPrivateChat(contact)"
            >
              <el-avatar :size="40" :src="contact.avatar">
                {{ contact.nickname?.charAt(0) || contact.username?.charAt(0) || "U" }}
              </el-avatar>
              <div class="contact-info">
                <div class="contact-name">
                  {{ contact.nickname || contact.username || contact.friendId }}
                </div>
                <div class="contact-meta">{{ contact.friendId }}</div>
              </div>
            </button>
          </div>
        </template>
        <el-empty v-else :description="t('sidebar.noContacts')" :image-size="60" />
      </div>

      <div v-show="activeTab === 'groups'" class="group-list chat-soft-scrollbar" role="list">
        <button
          v-for="group in filteredGroups"
          :key="group.id"
          type="button"
          class="group-item interactive-reset"
          @click="handleStartGroupChat(group)"
        >
          <el-avatar :size="40" :src="group.avatar">
            {{ group.groupName?.charAt(0) || "G" }}
          </el-avatar>
          <div class="group-info">
            <div class="group-name">{{ group.groupName }}</div>
            <div class="group-meta">{{ t("sidebar.members", { count: group.memberCount || 0 }) }}</div>
          </div>
        </button>
        <el-empty
          v-if="filteredGroups.length === 0"
          :description="t('sidebar.noGroups')"
          :image-size="60"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from "vue";
import {Bell, Plus, Search, Top} from "@element-plus/icons-vue";
import SideNavBar from "@/components/layout/SideNavBar.vue";
import {useI18nStore} from "@/stores/i18n";
import {useWebSocketStore} from "@/stores/websocket";
import type {ChatSession, Friend, Group} from "@/types";

interface Props {
  activeTab: "chat" | "contacts" | "groups";
  sessions: ChatSession[];
  currentSessionId?: string;
  friends: Friend[];
  groups: Group[];
  pendingRequestsCount: number;
  totalUnreadCount: number;
  isChatActiveOnMobile: boolean;
  searchKeyword?: string;
}

const props = withDefaults(defineProps<Props>(), {
  currentSessionId: "",
  searchKeyword: "",
});

const emit = defineEmits<{
  (e: "change-tab", tab: "chat" | "contacts" | "groups"): void;
  (e: "select-session", session: ChatSession): void;
  (e: "start-private-chat", contact: Friend): void;
  (e: "start-group-chat", group: Group): void;
  (e: "open-add-friend"): void;
  (e: "open-create-group"): void;
  (e: "open-settings"): void;
}>();

const webSocketStore = useWebSocketStore();
const {locale, t} = useI18nStore();
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
const groupFilterCache = new Map<string, { sourceKey: string; searchText: string }>();

const normalizedSearchKeyword = computed(() => debouncedSearchKeyword.value);

const panelTitle = computed(() => {
  if (props.activeTab === "contacts") {
    return t("sidebar.contactsTitle");
  }
  if (props.activeTab === "groups") {
    return t("sidebar.groupsTitle");
  }
  return t("sidebar.messagesTitle");
});

const panelSubtitle = computed(() => {
  if (props.activeTab === "contacts") {
    return t("sidebar.contactsAvailable", {count: props.friends.length});
  }
  if (props.activeTab === "groups") {
    return t("sidebar.groupsReady", {count: props.groups.length});
  }
  return t("sidebar.activeConversations", {count: props.sessions.length});
});

const handleChangeTab = (tab: string) => {
  if (tab === "chat" || tab === "contacts" || tab === "groups") {
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
  {immediate: true},
);

watch(
  () => props.activeTab,
  async (tab) => {
    if (tab !== "contacts" || resolvePinyinInitial.value) {
      return;
    }
    const {pinyin} = await import("pinyin-pro");
    resolvePinyinInitial.value = (value: string) =>
      pinyin(value, {
        pattern: "first",
        toneType: "none",
      }).toUpperCase();
    contactFilterCache.clear();
  },
  {immediate: true},
);

onUnmounted(() => {
  if (searchDebounceTimer.value) {
    clearTimeout(searchDebounceTimer.value);
  }
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
    return t("sidebar.minutesAgo", {count: Math.floor(diff / 60_000)});
  }
  if (diff < 86_400_000) {
    return t("sidebar.hoursAgo", {count: Math.floor(diff / 3_600_000)});
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
      return message.mediaName ? `${t("sidebar.file")} ${message.mediaName}` : t("sidebar.file");
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
    return t("sidebar.members", {count: session.memberCount});
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
  const displayName = contact.nickname || contact.username || contact.friendId || "";
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
    searchText: [contact.nickname, contact.username, contact.friendId, contact.remark]
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
    getContactCacheEntry(contact).searchText.includes(normalizedSearchKeyword.value),
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
    .map(([key, contacts]) => ({key, contacts}));
});

const getGroupCacheEntry = (group: Group) => {
  const groupId = String(group.id);
  const sourceKey = [group.id, group.groupName, group.name, group.memberCount || 0].join("|");
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
    getGroupCacheEntry(group).searchText.includes(normalizedSearchKeyword.value),
  );
});
</script>

<style scoped lang="scss">
.interactive-reset {
  border: 0;
  background: transparent;
}

.chat-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 100%;
  min-height: 0;
  min-width: 412px;
}

.list-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  backdrop-filter: var(--chat-glass-blur);
}

.panel-top {
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--chat-panel-border);
  background: rgba(255, 255, 255, 0.5);
}

.panel-heading {
  margin-bottom: 10px;
}

.panel-title {
  color: var(--chat-text-primary);
  font-size: 18px;
  font-weight: 700;
}

.panel-subtitle {
  margin-top: 4px;
  color: var(--chat-text-tertiary);
  font-size: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.add-btn {
  flex-shrink: 0;
}

.friend-request-alert {
  padding: 12px 14px 0;
  cursor: pointer;
}

.session-list,
.contact-list,
.group-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 8px 12px;
}

.session-item,
.contact-item,
.group-item {
  position: relative;
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  border: 1px solid transparent;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.82);
    border-color: rgba(37, 99, 235, 0.22);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  }
}

.session-item.active {
  background: var(--chat-card-active);
  border-color: var(--chat-card-active-border);
  box-shadow: 0 16px 38px rgba(37, 99, 235, 0.12);
}

.session-item.unread:not(.active) {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.session-accent {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 8px;
  background: transparent;
}

.session-item.active .session-accent {
  background: var(--chat-accent);
}

.session-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.session-info,
.contact-info,
.group-info {
  min-width: 0;
  flex: 1;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-title-wrap {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-name,
.contact-name,
.group-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chat-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.session-item.active .session-name {
  font-weight: 800;
}

.session-flags {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.session-flag {
  color: var(--chat-text-tertiary);
  font-size: 12px;
}

.session-time {
  flex-shrink: 0;
  color: var(--chat-text-quaternary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
}

.session-meta-row {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-presence,
.contact-meta,
.group-meta {
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}

.session-presence.online {
  color: var(--chat-success);
}

.session-preview {
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chat-text-tertiary);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.unread-badge {
  margin-left: auto;
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--chat-badge-bg);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 20px;
  text-align: center;
}

.presence-dot {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  background: #cbd5e1;
}

.presence-dot.online {
  background: var(--chat-success);
}

.contact-group {
  margin-bottom: 16px;
}

.group-header {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f8fafc;
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .chat-layout {
    min-width: 0;
  }

  .side-nav-bar {
    display: none;
  }

  .list-panel {
    width: 100%;

    &.hidden-mobile {
      display: none;
    }
  }

  .panel-top {
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
  }

  .session-list,
  .contact-list,
  .group-list {
    padding: 8px 8px 12px;
  }

  .session-item,
  .contact-item,
  .group-item {
    padding: 10px;
  }
}
</style>
