<template>
  <div class="mobile-chat-layout">
    <ConnectionStatusBar />

    <!-- 会话列表页 -->
    <template v-if="!currentSession">
      <MobileConversationList
        v-if="activeTab === 'chat'"
        :sessions="chatStore.sortedSessions"
        :loading="chatStore.loading"
        :user-avatar="userStore.avatar"
        :user-name="userStore.userInfo?.username || userStore.nickname"
        @select-session="selectSession"
        @open-create-group="showCreateGroup = true"
      />

      <div v-else-if="activeTab === 'contacts'" class="mobile-tab-placeholder">
        <el-icon :size="48" color="var(--text-tertiary)"><User /></el-icon>
        <p>{{ t("sidebar.contactsTitle") }}</p>
      </div>

      <MobileTabBar
        :active-tab="activeTab"
        :unread-count="chatStore.totalUnreadCount"
        :pending-requests="pendingRequestsCount"
        :moments-unread-count="momentsUnreadCount"
        @change-tab="handleMobileTabChange"
      />
    </template>

    <!-- 聊天详情页 -->
    <MobileChatRoom
      v-if="currentSession"
      :session="currentSession"
      :messages="chatStore.currentMessages"
      :current-user-id="String(userStore.userId)"
      :current-user-name="userStore.userInfo?.username || userStore.nickname"
      :current-user-avatar="userStore.avatar"
      :loading-history="loadingMoreHistory"
      :opened-unread-count="currentSessionUnreadSnapshot"
      :online="currentSessionOnline"
      :members="composerMembers"
      @back="chatStore.clearCurrentSession()"
      @more="showSessionInfoDrawer = true"
      @send-text="sendTextMessage"
      @send-media="sendMediaMessage"
      @request-history="loadMoreHistory"
      @mark-read="tryAckRead"
      @show-group-readers="openGroupReadDialog"
      @request-members="handleRequestMembers"
    />

    <ChatDialogs
      v-model:visible-add-friend="showAddFriend"
      v-model:visible-create-group="showCreateGroup"
      v-model:visible-group-read-dialog="showGroupReadDialog"
      v-model:visible-search-dialog="showSearchDialog"
      v-model:visible-session-info-drawer="showSessionInfoDrawer"
      :current-session="currentSession"
      :group-read-users="groupReadUsers"
      :search-results="chatStore.searchResults"
      :session-info-friend="sessionInfoFriend"
      :session-info-group="sessionInfoGroup"
      :session-info-members="sessionInfoMembers"
      :session-info-loading="sessionInfoLoading"
      :session-info-error="sessionInfoError"
      :private-session-online="currentSessionOnline"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { User } from "@element-plus/icons-vue";
import { useRouter } from "vue-router";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import ChatDialogs from "@/features/chat/ChatDialogs.vue";
import ConnectionStatusBar from "@/components/status/ConnectionStatusBar.vue";
import MobileChatRoom from "@/components/mobile/MobileChatRoom.vue";
import MobileConversationList from "@/components/mobile/MobileConversationList.vue";
import MobileTabBar from "@/components/mobile/MobileTabBar.vue";
import { useChatPage } from "@/features/chat/composables/useChatPage";
import { setupBackButtonHandler } from "@/services/platform/capacitor-init";

const router = useRouter();

const {
  userStore,
  chatStore,
  t,
  activeTab,
  showAddFriend,
  showCreateGroup,
  showGroupReadDialog,
  showSearchDialog,
  showSessionInfoDrawer,
  groupReadUsers,
  sessionInfoMembers,
  sessionInfoLoading,
  sessionInfoError,
  composerMembers,
  currentSession,
  loadingMoreHistory,
  pendingRequestsCount,
  momentsUnreadCount,
  currentSessionOnline,
  sessionInfoFriend,
  sessionInfoGroup,
  currentSessionUnreadSnapshot,
  handleTabChange,
  selectSession,
  sendTextMessage,
  sendMediaMessage,
  handleRequestMembers,
  loadMoreHistory,
  openGroupReadDialog,
  tryAckRead,
} = useChatPage();

const handleMobileTabChange = (tab: string) => {
  if (tab === "settings") {
    router.push("/settings");
    return;
  }
  if (tab === "moments") {
    router.push("/moments");
    return;
  }
  if (tab === "chat" || tab === "contacts" || tab === "groups") {
    handleTabChange(tab);
  }
};

onMounted(() => {
  if (Capacitor.isNativePlatform()) {
    setupBackButtonHandler(({ canGoBack }) => {
      if (currentSession.value) {
        chatStore.clearCurrentSession();
      } else if (showSessionInfoDrawer.value) {
        showSessionInfoDrawer.value = false;
      } else if (showCreateGroup.value) {
        showCreateGroup.value = false;
      } else if (showAddFriend.value) {
        showAddFriend.value = false;
      } else if (showSearchDialog.value) {
        showSearchDialog.value = false;
      } else if (showGroupReadDialog.value) {
        showGroupReadDialog.value = false;
      } else if (!canGoBack) {
        CapApp.exitApp();
      } else {
        window.history.back();
      }
    });
  }
});

onUnmounted(() => {
  if (Capacitor.isNativePlatform()) {
    setupBackButtonHandler(() => {});
  }
});
</script>

<style scoped lang="scss">
.mobile-chat-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--chat-shell-bg);
}

.mobile-tab-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-bottom: var(--mobile-tabbar-height, 56px);
  color: var(--text-tertiary);
  font-size: var(--text-base);
}
</style>
