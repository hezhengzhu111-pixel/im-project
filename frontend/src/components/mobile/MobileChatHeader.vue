<template>
  <header class="mch">
    <button
      type="button"
      class="mch-back"
      aria-label="Back"
      @click="$emit('back')"
    >
      <el-icon :size="20"><ArrowLeft /></el-icon>
    </button>

    <div class="mch-center">
      <div class="mch-avatar-wrap">
        <el-avatar :size="32" :src="avatar">{{ avatarText }}</el-avatar>
        <span v-if="isPrivate" class="mch-dot" :class="{ online }"></span>
      </div>
      <div class="mch-text">
        <span class="mch-name">{{ name }}</span>
        <span v-if="isPrivate" class="mch-status" :class="{ online }">
          {{ online ? t("sidebar.online") : t("sidebar.offline") }}
        </span>
        <span v-else-if="memberCount" class="mch-status">
          {{ t("sidebar.members", { count: memberCount }) }}
        </span>
      </div>
    </div>

    <button
      type="button"
      class="mch-more"
      aria-label="More"
      @click="$emit('more')"
    >
      <el-icon :size="20"><MoreFilled /></el-icon>
    </button>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft, MoreFilled } from "@element-plus/icons-vue";
import { useI18nStore } from "@/stores/i18n";
import { getAvatarText } from "@/utils/common";
import { computed } from "vue";

const props = defineProps<{
  name: string;
  avatar?: string;
  isPrivate?: boolean;
  online?: boolean;
  memberCount?: number;
}>();

defineEmits<{
  (e: "back"): void;
  (e: "more"): void;
}>();

const { t } = useI18nStore();
const avatarText = computed(() => getAvatarText(props.name));
</script>

<style scoped lang="scss">
.mch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  min-height: 52px;
  background: var(--chat-panel-bg);
  border-bottom: 1px solid var(--chat-panel-border);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  flex-shrink: 0;
}

.mch-back,
.mch-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;

  &:active {
    background: var(--surface-tertiary);
  }
}

.mch-center {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.mch-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.mch-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 8px;
  height: 8px;
  border: 2px solid var(--chat-panel-bg, #fff);
  border-radius: 50%;
  background: #cbd5e1;
}

.mch-dot.online {
  background: var(--chat-success, #22c55e);
}

.mch-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mch-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--chat-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mch-status {
  font-size: 12px;
  color: var(--chat-text-tertiary);
}

.mch-status.online {
  color: var(--chat-success, #22c55e);
}
</style>
