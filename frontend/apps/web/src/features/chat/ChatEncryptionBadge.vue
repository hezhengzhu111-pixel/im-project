<template>
  <el-tooltip
    content="此消息已端到端加密"
    placement="top"
    :show-after="300"
  >
    <span class="encryption-badge">
      <el-icon class="badge-icon"><Lock /></el-icon>
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
import { Lock } from "@element-plus/icons-vue";

defineProps<{
  encrypted: boolean;
}>();
</script>

<style scoped lang="scss">
.encryption-badge {
  position: absolute;
  right: 6px;
  bottom: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-placeholder);
  opacity: 0.35;
  transition: opacity 0.15s ease;
  cursor: default;
  pointer-events: auto;

  &:hover {
    opacity: 0.7;
  }

  .badge-icon {
    font-size: 10px;
  }
}
</style>
