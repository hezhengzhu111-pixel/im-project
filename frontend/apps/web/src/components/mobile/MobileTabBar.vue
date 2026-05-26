<template>
  <nav class="mobile-tabbar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="tabbar-item"
      :class="{ 'tabbar-item--active': activeTab === tab.key }"
      :aria-label="tab.label"
      @click="$emit('change', tab.key)"
    >
      <span class="tabbar-icon-wrap">
        <el-icon :size="24"><component :is="tab.icon" /></el-icon>
        <span v-if="tab.badge > 0" class="tabbar-badge">{{
          tab.badge > 99 ? "99+" : tab.badge
        }}</span>
      </span>
      <span class="tabbar-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ChatDotRound,
  User,
  PictureFilled,
  UserFilled,
} from "@element-plus/icons-vue";
import { useI18nStore } from "@/stores/i18n";

const props = defineProps<{
  activeTab: string;
  unreadCount?: number;
  pendingRequests?: number;
  momentsUnreadCount?: number;
}>();

defineEmits<{
  (e: "change", key: string): void;
}>();

const { t } = useI18nStore();

const tabs = computed(() => [
  {
    key: "chat",
    label: t("sidebar.messagesTitle"),
    icon: ChatDotRound,
    badge: props.unreadCount || 0,
  },
  {
    key: "contacts",
    label: t("sidebar.contactsTitle"),
    icon: User,
    badge: props.pendingRequests || 0,
  },
  {
    key: "moments",
    label: t("nav.moments"),
    icon: PictureFilled,
    badge: props.momentsUnreadCount || 0,
  },
  {
    key: "me",
    label: t("nav.me"),
    icon: UserFilled,
    badge: 0,
  },
]);
</script>

<style scoped lang="scss">
.mobile-tabbar {
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--mobile-tabbar-height, 56px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--chat-panel-bg, #fff);
  border-top: 1px solid var(--chat-panel-border, #e5e7eb);
  z-index: 100;
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 0;
  color: var(--text-tertiary, #94a3b8);
  transition: color 0.15s ease;

  &--active {
    color: var(--color-primary, #6366f1);
  }
}

.tabbar-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tabbar-badge {
  position: absolute;
  top: -4px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--el-color-danger, #f56c6c);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.tabbar-label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
}
</style>
