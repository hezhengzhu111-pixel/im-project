<template>
  <div class="chat-layout">
    <SideNavBar
      :active-tab="activeTab"
      :unread-count="totalUnreadCount"
      :pending-requests="pendingRequestsCount"
      @change-tab="emit('change-tab', $event)"
      @settings="emit('open-settings')"
      class="side-nav-bar"
    />

    <div class="list-panel" :class="{ 'hidden-mobile': isChatActiveOnMobile }">
      <div class="search-box">
        <el-input
          v-model="localSearchKeyword"
          placeholder="搜索"
          prefix-icon="Search"
          clearable
          aria-label="搜索联系人或群组"
        />
        <div class="add-btn" v-if="activeTab !== 'chat'">
          <el-button
            v-if="activeTab === 'contacts'"
            size="small"
            :icon="Plus"
            circle
            aria-label="添加好友"
            title="添加好友"
            @click="emit('open-add-friend')"
          />
          <el-button
            v-if="activeTab === 'groups'"
            size="small"
            :icon="Plus"
            circle
            aria-label="创建群组"
            title="创建群组"
            @click="emit('open-create-group')"
          />
        </div>
      </div>

      <div
        v-if="activeTab === 'contacts' && pendingRequestsCount > 0"
        class="friend-request-alert"
        @click="$router.push('/contacts')"
      >
        <el-alert
          :title="`新的朋友 (${pendingRequestsCount})`"
          type="info"
          :closable="false"
          show-icon
        />
      </div>

      <div class="session-list" v-show="activeTab === 'chat'" role="list">
        <button
          v-for="session in filteredSessions"
          :key="session.id"
          type="button"
          class="session-item interactive-reset"
          :class="{ active: currentSessionId === session.id }"
          @click="emit('select-session', session)"
        >
          <el-avatar :size="40" :src="session.targetAvatar" shape="square">
            {{ session.targetName?.charAt(0) || "U" }}
          </el-avatar>
          <div class="session-info">
            <div class="session-header">
              <span class="session-name">{{ session.targetName }}</span>
              <span class="session-time">{{ formatTime(session.lastActiveTime) }}</span>
            </div>
            <div class="session-content">
              <span class="last-message">{{ previewMessage(session.lastMessage) }}</span>
              <el-badge
                v-if="session.unreadCount > 0"
                :value="session.unreadCount"
                class="unread-badge"
                :max="99"
              />
            </div>
          </div>
        </button>
        <el-empty
          v-if="filteredSessions.length === 0"
          description="暂无消息"
          :image-size="60"
        />
      </div>

      <div class="contact-list" v-show="activeTab === 'contacts'" role="list">
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
              @click="emit('start-private-chat', contact)"
            >
              <el-avatar :size="36" :src="contact.avatar" shape="square">
                {{ contact.nickname?.charAt(0) || "U" }}
              </el-avatar>
              <div class="contact-info">
                <div class="contact-name">{{ contact.nickname || contact.username }}</div>
              </div>
            </button>
          </div>
        </template>
        <el-empty v-else description="暂无联系人" :image-size="60" />
      </div>

      <div class="group-list" v-show="activeTab === 'groups'" role="list">
        <button
          v-for="group in filteredGroups"
          :key="group.id"
          type="button"
          class="group-item interactive-reset"
          @click="emit('start-group-chat', group)"
        >
          <el-avatar :size="36" :src="group.avatar" shape="square">
            {{ group.groupName?.charAt(0) || "G" }}
          </el-avatar>
          <div class="group-info">
            <div class="group-name">{{ group.groupName }}</div>
          </div>
        </button>
        <el-empty
          v-if="filteredGroups.length === 0"
          description="暂无群组"
          :image-size="60"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { pinyin } from "pinyin-pro";
import SideNavBar from "@/components/layout/SideNavBar.vue";
import type { ChatSession, Friend, Group } from "@/types";

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

const localSearchKeyword = ref(props.searchKeyword);

watch(
  () => props.searchKeyword,
  (value) => {
    localSearchKeyword.value = value;
  },
);

const filteredSessions = computed(() => {
  if (!localSearchKeyword.value) {
    return props.sessions;
  }
  return props.sessions.filter((session) =>
    session.targetName.toLowerCase().includes(localSearchKeyword.value.toLowerCase()),
  );
});

const filteredContacts = computed(() => {
  if (!localSearchKeyword.value) {
    return props.friends;
  }
  return props.friends.filter((contact) =>
    (contact.nickname || contact.username || "")
      .toLowerCase()
      .includes(localSearchKeyword.value.toLowerCase()),
  );
});

const groupedContacts = computed(() => {
  const groups = new Map<string, Friend[]>();
  filteredContacts.value.forEach((contact) => {
    const name = contact.nickname || contact.username || "";
    let firstChar = name.charAt(0).toUpperCase();
    if (/[\u4e00-\u9fa5]/.test(firstChar)) {
      firstChar = pinyin(firstChar, {
        pattern: "first",
        toneType: "none",
      }).toUpperCase();
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
  if (!localSearchKeyword.value) {
    return props.groups;
  }
  return props.groups.filter((group) =>
    (group.groupName || group.name || "")
      .toLowerCase()
      .includes(localSearchKeyword.value.toLowerCase()),
  );
});

const formatTime = (time?: string) => {
  if (!time) {
    return "";
  }
  const date = new Date(time);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return date.toLocaleDateString();
};

const previewMessage = (message?: ChatSession["lastMessage"]) => {
  if (!message) return "";
  switch (message.messageType) {
    case "IMAGE":
      return "[图片]";
    case "FILE":
      return message.mediaName ? `[文件] ${message.mediaName}` : "[文件]";
    case "VOICE":
      return "[语音]";
    case "VIDEO":
      return "[视频]";
    case "SYSTEM":
      return message.content || "[系统消息]";
    default:
      return message.content || "";
  }
};
</script>

<style scoped lang="scss">
.interactive-reset {
  background: transparent;
  border: 0;
}

.chat-layout {
  display: flex;
  height: 100%;
}

.list-panel {
  width: 280px;
  background-color: #fff;
  border-right: 1px solid #dcdfe6;
  display: flex;
  flex-direction: column;
}

.search-box {
  padding: 15px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 8px;
}

.friend-request-alert {
  padding: 10px;
  cursor: pointer;
}

.session-list,
.contact-list,
.group-list {
  flex: 1;
  overflow-y: auto;
}

.session-item,
.contact-item,
.group-item {
  width: 100%;
  padding: 12px 15px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;
  text-align: left;

  &:hover {
    background-color: #f5f7fa;
  }

  &.active {
    background-color: #ecf5ff;
  }
}

.session-info,
.contact-info,
.group-info {
  flex: 1;
  margin-left: 10px;
  overflow: hidden;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.session-name {
  font-weight: 500;
  color: #303133;
}

.session-time,
.last-message {
  font-size: 12px;
  color: #909399;
}

.session-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.last-message {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-group .group-header {
  padding: 5px 15px;
  background-color: #f5f7fa;
  color: #909399;
  font-size: 12px;
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
