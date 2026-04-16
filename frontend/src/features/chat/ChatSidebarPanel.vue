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

      <div v-show="activeTab === 'chat'" class="session-list" role="list">
        <button
          v-for="item in filteredSessionItems"
          :key="item.session.id"
          type="button"
          class="session-item interactive-reset"
          :class="{ active: currentSessionId === item.session.id }"
          @click="handleSelectSession(item.session)"
        >
          <div class="session-avatar-wrap">
            <el-avatar :size="42" :src="item.session.targetAvatar" shape="square">
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
              <div class="session-title">
                <span class="session-name">{{ item.session.targetName }}</span>
                <span v-if="item.session.isPinned || item.session.isMuted" class="session-flags">
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
                <span
                  v-if="item.session.type === 'private'"
                  class="session-presence"
                  :class="{ online: item.online }"
                >
                  {{ item.online ? "Online" : "Offline" }}
                </span>
              </div>
              <span class="session-time">{{ formatTime(item.session.lastActiveTime) }}</span>
            </div>
            <div class="session-content">
              <span class="last-message">{{ item.preview }}</span>
              <span
                v-if="item.session.unreadCount > 0"
                class="unread-badge"
                :aria-label="`${item.session.unreadCount} unread messages`"
              >
                {{ item.session.unreadCount > 99 ? "99+" : item.session.unreadCount }}
              </span>
            </div>
          </div>
        </button>
        <el-empty
          v-if="filteredSessionItems.length === 0"
          description="No conversations yet"
          :image-size="60"
        />
      </div>

      <div v-show="activeTab === 'contacts'" class="contact-list" role="list">
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
              <el-avatar :size="36" :src="contact.avatar" shape="square">
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

      <div v-show="activeTab === 'groups'" class="group-list" role="list">
        <button
          v-for="group in filteredGroups"
          :key="group.id"
          type="button"
          class="group-item interactive-reset"
          @click="handleStartGroupChat(group)"
        >
          <el-avatar :size="36" :src="group.avatar" shape="square">
            {{ group.groupName?.charAt(0) || "G" }}
          </el-avatar>
          <div class="group-info">
            <div class="group-name">{{ group.groupName }}</div>
            <div class="group-meta">
              {{ group.memberCount || 0 }} members
            </div>
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
    const { pinyin } = await import("pinyin-pro");
    resolvePinyinInitial.value = (value: string) =>
      pinyin(value, {
        pattern: "first",
        toneType: "none",
      }).toUpperCase();
  },
  { immediate: true },
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
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  return date.toLocaleDateString();
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
    [
      contact.nickname,
      contact.username,
      contact.friendId,
      contact.remark,
    ]
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
    .map(([key, contacts]) => ({ key, contacts }));
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
  width: 316px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(226, 232, 240, 0.82);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(16px);
}

.panel-top {
  padding: 18px 16px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(255, 255, 255, 0.88));
}

.panel-heading {
  margin-bottom: 14px;
}

.panel-title {
  color: #111827;
  font-size: 18px;
  font-weight: 800;
}

.panel-subtitle {
  margin-top: 4px;
  color: #64748b;
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
  padding: 10px;
}

.session-item,
.contact-item,
.group-item {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 18px;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    background-color 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    background: #f8fbff;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
  }

  &.active {
    background: linear-gradient(135deg, #e0f2fe, #eff6ff);
    box-shadow: 0 16px 30px rgba(37, 99, 235, 0.12);
  }
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
  margin-left: 12px;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-flags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #64748b;
}

.session-flag {
  font-size: 12px;
}

.session-name,
.contact-name,
.group-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #0f172a;
  font-weight: 700;
}

.session-presence,
.session-time,
.last-message,
.contact-meta,
.group-meta {
  color: #64748b;
  font-size: 12px;
}

.session-presence.online {
  color: #10b981;
}

.session-time {
  flex-shrink: 0;
}

.session-content {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.last-message {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-badge {
  flex-shrink: 0;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
  box-shadow: 0 10px 22px rgba(239, 68, 68, 0.25);
}

.presence-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 11px;
  height: 11px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #cbd5e1;
}

.presence-dot.online {
  background: #10b981;
}

.contact-group {
  margin-bottom: 14px;
}

.group-header {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: 8px;
  padding: 6px 12px;
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
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
}
</style>
