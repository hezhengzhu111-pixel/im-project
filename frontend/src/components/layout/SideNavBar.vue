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
        :title="t('nav.messages')"
        :aria-label="t('nav.messages')"
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
        :title="t('nav.contacts')"
        :aria-label="t('nav.contacts')"
        @click="$emit('change-tab', 'contacts')"
      >
        <el-icon :size="24"><User /></el-icon>
        <span v-if="(pendingRequests || 0) > 0" class="badge dot"></span>
      </button>

      <button
        type="button"
        class="nav-icon interactive-reset"
        :class="{ active: activeTab === 'groups' }"
        :title="t('nav.groups')"
        :aria-label="t('nav.groups')"
        @click="$emit('change-tab', 'groups')"
      >
        <el-icon :size="24"><UserFilled /></el-icon>
      </button>
    </div>

    <div class="bottom-icons">
      <button
        type="button"
        class="nav-icon interactive-reset"
        :title="t('nav.settings')"
        :aria-label="t('nav.settings')"
        @click="$emit('settings')"
      >
        <el-icon :size="24"><Setting /></el-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ChatDotRound, Setting, User, UserFilled,} from "@element-plus/icons-vue";
import {useI18nStore} from "@/stores/i18n";
import {useUserStore} from "@/stores/user";

const userStore = useUserStore();
const {t} = useI18nStore();

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
  width: 64px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0 16px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(148, 163, 184, 0.12);
}

.user-avatar {
  margin-bottom: 24px;
  padding: 5px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.nav-icons {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nav-icon {
  position: relative;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: rgba(226, 232, 240, 0.6);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    color: #fff;
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.1);
  }

  &.active {
    color: #fff;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.7), rgba(129, 140, 248, 0.7));
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.2);
  }
}

.bottom-icons {
  margin-top: auto;
}

.badge {
  position: absolute;
  top: -2px;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;

  &.dot {
    width: 8px;
    min-width: 8px;
    height: 8px;
    padding: 0;
    top: 2px;
    right: 2px;
  }
}
</style>
