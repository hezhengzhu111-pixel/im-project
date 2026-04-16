<!-- Deprecated: legacy chat UI component. Active chat flow uses frontend/src/features/chat/*. -->
<template>
  <div class="chat-sidebar">
    <!-- 用户信息 -->
    <div class="user-section">
      <UserProfile
        :user-info="userInfo"
        @edit-profile="handleEditProfile"
        @change-status="handleChangeStatus"
        @logout="handleLogout"
      />
    </div>

    <!-- 搜索框 -->
    <div class="search-section">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索聊天、联系人"
        :prefix-icon="Search"
        clearable
        @input="handleSearch"
      />
    </div>

    <!-- 功能标签 -->
    <div class="tabs-section">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="聊天" name="chat">
          <template #label>
            <el-badge
              :value="totalUnreadCount"
              :hidden="totalUnreadCount === 0"
              :max="99"
            >
              <span>聊天</span>
            </el-badge>
          </template>
        </el-tab-pane>
        <el-tab-pane label="联系人" name="contacts">
          <template #label>
            <el-badge
              :value="pendingFriendRequests"
              :hidden="pendingFriendRequests === 0"
              :max="99"
              type="warning"
            >
              <span>联系人</span>
            </el-badge>
          </template>
        </el-tab-pane>
        <el-tab-pane label="群组" name="groups" />
      </el-tabs>
    </div>

    <!-- 内容区域 -->
    <div class="content-section">
      <!-- 聊天列表 -->
      <div v-if="activeTab === 'chat'" class="chat-list">
        <ConversationList
          :conversations="conversations"
          :active-conversation-id="activeConversationId"
          @select="handleSelectConversation"
          @search="handleConversationSearch"
        />
      </div>

      <!-- 联系人列表 -->
      <div v-else-if="activeTab === 'contacts'" class="contacts-list">
        <ContactsList
          @add-friend="handleAddFriend"
          @accept-friend="handleAcceptFriend"
          @reject-friend="handleRejectFriend"
          @start-chat="handleStartChat"
        />
      </div>

      <!-- 群组列表 -->
      <div v-else-if="activeTab === 'groups'" class="groups-list">
        <div class="groups-header">
          <el-button
            type="primary"
            size="small"
            :icon="Plus"
            @click="handleCreateGroup"
          >
            创建群组
          </el-button>
        </div>

        <div class="groups-content">
          <GroupList
            v-if="groups.length > 0"
            :groups="groups"
            :active-group-id="activeGroupId"
            @select="handleSelectGroup"
            @leave="handleLeaveGroup"
          />
          <el-empty v-else description="暂无群组" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from "vue";
import {Plus, Search} from "@element-plus/icons-vue";
import {debounce} from "@/utils/common";
import UserProfile from "./UserProfile.vue";
import ConversationList from "./ConversationList.vue";
import ContactsList from "./ContactsList.vue";
import GroupList from "./GroupList.vue";
import type {User} from "@/types/user";
import type {Conversation} from "@/types/chat";
import type {Group} from "@/types/group";

interface Props {
  userInfo?: User | null;
  conversations: Conversation[];
  groups: Group[];
  activeConversationId?: string;
  activeGroupId?: string;
  totalUnreadCount?: number;
  pendingFriendRequests?: number;
}

interface Emits {
  (e: "tab-change", tab: string): void;
  (e: "search", keyword: string): void;
  (e: "select-conversation", conversation: Conversation): void;
  (e: "select-group", group: Group): void;
  (e: "edit-profile"): void;
  (e: "change-status", status: string): void;
  (e: "logout"): void;
  (e: "add-friend", userId: string): void;
  (e: "accept-friend", requestId: string): void;
  (e: "reject-friend", requestId: string): void;
  (e: "start-chat", userId: string): void;
  (e: "create-group"): void;
  (e: "leave-group", groupId: string): void;
}

withDefaults(defineProps<Props>(), {
  totalUnreadCount: 0,
  pendingFriendRequests: 0,
});

const emit = defineEmits<Emits>();

// 响应式数据
const activeTab = ref("chat");
const searchKeyword = ref("");

// 方法
const handleTabChange = (tab: string) => {
  activeTab.value = tab;
  emit("tab-change", tab);
};

const handleSearch = debounce((keyword: string) => {
  emit("search", keyword);
}, 300);

const handleSelectConversation = (conversation: Conversation) => {
  emit("select-conversation", conversation);
};

const handleConversationSearch = (keyword: string) => {
  searchKeyword.value = keyword;
  emit("search", keyword);
};

const handleSelectGroup = (group: Group) => {
  emit("select-group", group);
};

const handleEditProfile = () => {
  emit("edit-profile");
};

const handleChangeStatus = (status: string) => {
  emit("change-status", status);
};

const handleLogout = () => {
  emit("logout");
};

const handleAddFriend = (userId: string) => {
  emit("add-friend", userId);
};

const handleAcceptFriend = (requestId: string) => {
  emit("accept-friend", requestId);
};

const handleRejectFriend = (requestId: string) => {
  emit("reject-friend", requestId);
};

const handleStartChat = (userId: string) => {
  emit("start-chat", userId);
};

const handleCreateGroup = () => {
  emit("create-group");
};

const handleLeaveGroup = (groupId: string) => {
  emit("leave-group", groupId);
};
</script>

<style lang="scss" scoped>
.chat-sidebar {
  width: 300px;
  height: 100vh;
  background-color: #f5f7fa;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-section {
  flex-shrink: 0;
  padding: 16px;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.search-section {
  flex-shrink: 0;
  padding: 16px;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.tabs-section {
  flex-shrink: 0;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;

  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 16px;
  }

  :deep(.el-tabs__nav-wrap) {
    padding: 8px 0;
  }

  :deep(.el-tabs__item) {
    padding: 8px 16px;
    font-size: 14px;
  }
}

.content-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chat-list,
.contacts-list {
  flex: 1;
  overflow: hidden;
}

.groups-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.groups-header {
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
  background-color: #fff;
}

.groups-content {
  flex: 1;
  overflow: hidden;
  background-color: #fff;
}

// 响应式设计
@media (max-width: 768px) {
  .chat-sidebar {
    width: 100%;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.3s ease;

    &.mobile-open {
      transform: translateX(0);
    }
  }

  .user-section,
  .search-section,
  .groups-header {
    padding: 12px;
  }

  :deep(.el-tabs__item) {
    padding: 6px 12px;
    font-size: 13px;
  }
}

// 滚动条样式
.content-section::-webkit-scrollbar {
  width: 4px;
}

.content-section::-webkit-scrollbar-track {
  background: transparent;
}

.content-section::-webkit-scrollbar-thumb {
  background-color: #c0c4cc;
  border-radius: 2px;

  &:hover {
    background-color: #909399;
  }
}
</style>
