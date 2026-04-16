<template>
  <div class="side-nav-bar">
    <div class="user-avatar">
      <el-avatar :size="38" :src="userStore.avatar" shape="square" />
    </div>

    <div class="nav-icons">
      <button
        type="button"
        class="nav-icon interactive-reset"
        :class="{ active: activeTab === 'chat' }"
        title="Messages"
        @click="$emit('change-tab', 'chat')"
      >
        <el-icon :size="24"><ChatDotRound /></el-icon>
        <span v-if="(unreadCount || 0) > 0" class="badge">
          {{ (unreadCount || 0) > 99 ? "99+" : unreadCount || 0 }}
        </span>
      </button>

      <button
        type="button"
        class="nav-icon interactive-reset"
        :class="{ active: activeTab === 'contacts' }"
        title="Contacts"
        @click="$emit('change-tab', 'contacts')"
      >
        <el-icon :size="24"><User /></el-icon>
        <span v-if="(pendingRequests || 0) > 0" class="badge dot"></span>
      </button>

      <button
        type="button"
        class="nav-icon interactive-reset"
        :class="{ active: activeTab === 'groups' }"
        title="Groups"
        @click="$emit('change-tab', 'groups')"
      >
        <el-icon :size="24"><UserFilled /></el-icon>
      </button>
    </div>

    <div class="bottom-icons">
      <button
        type="button"
        class="nav-icon interactive-reset"
        title="Settings"
        @click="$emit('settings')"
      >
        <el-icon :size="24"><Setting /></el-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ChatDotRound, Setting, User, UserFilled,} from "@element-plus/icons-vue";
import {useUserStore} from "@/stores/user";

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
.interactive-reset {
  border: 0;
  background: transparent;
}

.side-nav-bar {
  width: 72px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 0 18px;
  flex-shrink: 0;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 22%),
    linear-gradient(180deg, #0f172a 0%, #111827 100%);
  border-right: 1px solid rgba(148, 163, 184, 0.18);
}

.user-avatar {
  margin-bottom: 28px;
  padding: 6px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.nav-icons {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nav-icon {
  position: relative;
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: rgba(226, 232, 240, 0.7);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    color: #fff;
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.08);
  }

  &.active {
    color: #fff;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    box-shadow: 0 14px 28px rgba(34, 197, 94, 0.28);
  }
}

.bottom-icons {
  margin-top: auto;
}

.badge {
  position: absolute;
  top: -3px;
  right: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;

  &.dot {
    width: 9px;
    min-width: 9px;
    height: 9px;
    padding: 0;
    top: 3px;
    right: 3px;
  }
}
</style>
