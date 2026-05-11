<template>
  <el-tooltip
    v-if="encrypted"
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-left: 4px;
  color: var(--chat-text-quaternary);
  opacity: 0.6;
  transition: opacity 0.15s ease;
  cursor: default;

  &:hover {
    opacity: 1;
  }

  .badge-icon {
    font-size: 11px;
  }
}
</style>
