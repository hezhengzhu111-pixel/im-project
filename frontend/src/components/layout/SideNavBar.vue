<template>
  <div class="side-nav-bar">
    <div class="user-avatar">
      <el-avatar :size="36" :src="userStore.avatar" shape="square" />
    </div>

    <div class="nav-icons">
      <div
        class="nav-icon"
        :class="{ active: activeTab === 'chat' }"
        @click="$emit('change-tab', 'chat')"
        title="聊天"
      >
        <el-icon :size="24"><ChatDotRound /></el-icon>
        <div v-if="unreadCount > 0" class="badge">
          {{ unreadCount > 99 ? "99+" : unreadCount }}
        </div>
      </div>

      <div
        class="nav-icon"
        :class="{ active: activeTab === 'contacts' }"
        @click="$emit('change-tab', 'contacts')"
        title="通讯录"
      >
        <el-icon :size="24"><User /></el-icon>
        <div v-if="pendingRequests > 0" class="badge dot"></div>
      </div>

      <div
        class="nav-icon"
        :class="{ active: activeTab === 'groups' }"
        @click="$emit('change-tab', 'groups')"
        title="群组"
      >
        <el-icon :size="24"><UserFilled /></el-icon>
      </div>
    </div>

    <div class="bottom-icons">
      <div class="nav-icon" @click="$emit('settings')">
        <el-icon :size="24"><Setting /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ChatDotRound,
  User,
  UserFilled,
  Setting,
} from "@element-plus/icons-vue";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();

defineProps<{
  activeTab: string;
  unreadCount?: number;
  pendingRequests?: number;
}>();

defineEmits<{
  (e: "change-tab", tab: string): void;
  (e: "settings"): void;
}>();
</script>

<style scoped lang="scss">
.side-nav-bar {
  width: 60px;
  height: 100vh;
  background-color: #2e2e2e;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 30px;
  padding-bottom: 20px;
  flex-shrink: 0;
}

.user-avatar {
  margin-bottom: 30px;
  cursor: pointer;
}

.nav-icons {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}

.nav-icon {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #999;
  cursor: pointer;
  transition: color 0.3s;

  &:hover {
    color: #fff;
  }

  &.active {
    color: #07c160;
  }
}

.bottom-icons {
  margin-top: auto;
}

.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #fa5151;
  color: white;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 10px;
  min-width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;

  &.dot {
    width: 8px;
    height: 8px;
    min-width: 0;
    padding: 0;
    top: 2px;
    right: 2px;
  }
}
</style>
