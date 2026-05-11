<template>
  <div v-if="status !== 'plaintext'" class="encryption-banner" :class="status">
    <template v-if="status === 'negotiating'">
      <el-icon class="banner-icon spin"><Loading /></el-icon>
      <span class="banner-text">加密协商中...</span>
    </template>
    <template v-else-if="status === 'encrypted'">
      <el-icon class="banner-icon"><Lock /></el-icon>
      <span class="banner-text">端到端加密已开启</span>
      <button type="button" class="banner-link" @click="emit('showInfo')">
        详情
      </button>
    </template>
    <template v-else-if="status === 'failed'">
      <el-icon class="banner-icon"><Lock /></el-icon>
      <span class="banner-text">端到端加密异常</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Lock, Loading } from "@element-plus/icons-vue";
import type { E2eeSessionStatus } from "@/features/e2ee/types";

defineProps<{
  status: E2eeSessionStatus;
}>();

const emit = defineEmits<{
  (e: "showInfo"): void;
}>();
</script>

<style scoped lang="scss">
.encryption-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--chat-panel-border);
  transition: background-color 0.2s ease, color 0.2s ease;

  &.negotiating {
    background: rgba(251, 191, 36, 0.08);
    color: #b45309;
    border-bottom-color: rgba(251, 191, 36, 0.2);
  }

  &.encrypted {
    background: rgba(34, 197, 94, 0.08);
    color: #15803d;
    border-bottom-color: rgba(34, 197, 94, 0.2);
  }

  &.failed {
    background: rgba(239, 68, 68, 0.08);
    color: #b91c1c;
    border-bottom-color: rgba(239, 68, 68, 0.2);
  }
}

.banner-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.banner-text {
  letter-spacing: 0.01em;
}

.banner-link {
  border: 0;
  background: transparent;
  padding: 0;
  margin-left: 4px;
  color: inherit;
  font-size: 12px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 1;
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
