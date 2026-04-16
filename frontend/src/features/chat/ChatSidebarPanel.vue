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
            placeholder="Search"
            aria-label="Search contacts, groups, or conversations"
          />
          <div v-if="activeTab !== 'chat'" class="add-btn">
            <el-button
              v-if="activeTab === 'contacts'"
              size="small"
              :icon="Plus"
              circle
              aria-label="Add friend"
              title="Add friend"
              @click="handleOpenAddFriend"
            />
            <el-button
              v-if="activeTab === 'groups'"
              size="small"
              :icon="Plus"
              circle
              aria-label="Create group"
              title="Create group"
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
          :title="`Pending requests (${pendingRequestsCount})`"
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
            <el-avatar :size="46" :src="item.session.targetAvatar">
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
                    aria-label="Pinned conversation"
                  >
                    <Top />
                  </el-icon>
                  <el-icon
                    v-if="item.session.isMuted"
                    class="session-flag"
                    aria-label="Muted conversation"
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
                {{ item.online ? "Online" : "Offline" }}
              </span>
              <span v-else class="session-presence">
                {{ item.session.memberCount || 0 }} members
              </span>
              <span
                v-if="item.session.unreadCount > 0"
                class="unread-badge"
                :aria-label="`${item.session.unreadCount} unread messages`"
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
          description="No conversations yet"
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
        <el-empty v-else description="No contacts found" :image-size="60" />
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
            <div class="group-meta">{{ group.memberCount || 0 }} members</div>
          </div>
        </button>
        <el-empty
          v-if="filteredGroups.length === 0"
          description="No groups found"
          :image-size="60"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {Bell, Plus, Search, Top} from "@element-plus/icons-vue";
import SideNavBar from "@/components/layout/SideNavBar.vue";
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
const localSearchKeyword = ref(props.searchKeyword);
const resolvePinyinInitial = ref<((value: string) => string) | null>(null);

const normalizedSearchKeyword = computed(() =>
  localSearchKeyword.value.trim().toLowerCase(),
);

const panelTitle = computed(() => {
  if (props.activeTab === "contacts") {
    return "Contacts";
  }
  if (props.activeTab === "groups") {
    return "Groups";
  }
  return "Messages";
});

const panelSubtitle = computed(() => {
  if (props.activeTab === "contacts") {
    return `${props.friends.length} contacts available`;
  }
  if (props.activeTab === "groups") {
    return `${props.groups.length} groups ready`;
  }
  return `${props.sessions.length} active conversations`;
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
  },
  {immediate: true},
);

const formatTime = (time?: string) => {
  if (!time) {
    return "";
  }
  const date = new Date(time);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) {
    return "Just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h`;
  }
  return date.toLocaleDateString(undefined, {
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
      return "[Image]";
    case "FILE":
      return message.mediaName ? `[File] ${message.mediaName}` : "[File]";
    case "VOICE":
      return "[Voice]";
    case "VIDEO":
      return "[Video]";
    case "SYSTEM":
      return message.content || "[System]";
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
    return online ? "Available now" : "No recent messages";
  }
  if (session.memberCount && session.memberCount > 0) {
    return `${session.memberCount} members`;
  }
  return "No recent messages";
};

const sessionItems = computed(() =>
  props.sessions.map((session) => {
    const online = isSessionOnline(session);
    const preview = sessionPreview(session, online);
    const searchText = [
      session.targetName,
      preview,
      session.conversationName,
      session.targetId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      session,
      online,
      preview,
      searchText,
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

const filteredContacts = computed(() => {
  if (!normalizedSearchKeyword.value) {
    return props.friends;
  }
  return props.friends.filter((contact) =>
    [contact.nickname, contact.username, contact.friendId, contact.remark]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearchKeyword.value),
  );
});

const groupedContacts = computed(() => {
  const groups = new Map<string, Friend[]>();
  filteredContacts.value.forEach((contact) => {
    const name = contact.nickname || contact.username || contact.friendId || "";
    let firstChar = name.charAt(0).toUpperCase();
    if (/[\u4e00-\u9fa5]/.test(firstChar) && resolvePinyinInitial.value) {
      firstChar = resolvePinyinInitial.value(firstChar);
    }
    if (!/[A-Z]/.test(firstChar)) {
      firstChar = "#";
    }
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

const filteredGroups = computed(() => {
  if (!normalizedSearchKeyword.value) {
    return props.groups;
  }
  return props.groups.filter((group) =>
    [group.groupName, group.name, group.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearchKeyword.value),
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
  height: 100%;
}

.list-panel {
  width: 340px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(203, 213, 225, 0.82);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18px);
}

.panel-top {
  padding: 18px 16px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 26%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.92));
}

.panel-heading {
  margin-bottom: 14px;
}

.panel-title {
  color: var(--chat-text-primary);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
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
  overflow-y: auto;
  padding: 12px 10px 14px;
}

.session-item,
.contact-item,
.group-item {
  position: relative;
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  margin-bottom: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    background: var(--chat-card-hover);
    border-color: rgba(191, 219, 254, 0.78);
    box-shadow: 0 18px 34px rgba(15, 23, 42, 0.08);
  }
}

.session-item.active {
  background: var(--chat-card-active);
  border-color: var(--chat-card-active-border);
  box-shadow: 0 20px 40px rgba(37, 99, 235, 0.14);
}

.session-item.unread:not(.active) {
  border-color: rgba(191, 219, 254, 0.62);
  background: rgba(248, 250, 255, 0.92);
}

.session-accent {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 6px;
  width: 4px;
  border-radius: 999px;
  background: transparent;
}

.session-item.active .session-accent {
  background: linear-gradient(180deg, #2563eb, #60a5fa);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
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
  font-size: 15px;
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
  font-weight: 600;
  line-height: 1.4;
}

.session-meta-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.session-presence,
.contact-meta,
.group-meta {
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.session-presence.online {
  color: var(--chat-success);
}

.session-preview {
  display: -webkit-box;
  margin-top: 8px;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--chat-text-tertiary);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.unread-badge {
  flex-shrink: 0;
  min-width: 26px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--chat-badge-bg);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  line-height: 24px;
  text-align: center;
  box-shadow: var(--chat-badge-shadow);
}

.presence-dot {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
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
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.94);
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 768px) {
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
    padding: 10px 10px 12px;
  }

  .session-item,
  .contact-item,
  .group-item {
    padding: 14px 12px;
  }
}
</style>
