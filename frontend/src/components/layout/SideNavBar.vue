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
  width: 72px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 0 18px;
  flex-shrink: 0;
  background:
    radial-gradient(circle at top, rgba(37, 99, 235, 0.18), transparent 24%),
    rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(18px);
  border-right: 1px solid rgba(148, 163, 184, 0.18);
}

.user-avatar {
  margin-bottom: 28px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
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
  border-radius: 8px;
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
    background: rgba(37, 99, 235, 0.88);
    box-shadow: 0 14px 28px rgba(37, 99, 235, 0.24);
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
