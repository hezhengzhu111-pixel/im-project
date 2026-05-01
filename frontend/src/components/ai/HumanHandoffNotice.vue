<template>
  <div class="human-handoff-notice">
    <div class="handoff-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </div>
    <span class="handoff-text">
      {{ operatorName ? `${operatorName} 已接管` : '客服已接管' }}，本轮 AI 自动回复暂停
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  operatorName?: string;
}>();
</script>

<style scoped lang="scss">
.human-handoff-notice {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(100%, 460px);
  padding: 6px 14px;
  border-radius: var(--radius-full, 999px);
  background: color-mix(in srgb, var(--color-warning, #f59e0b), transparent 90%);
  border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b), transparent 70%);
  color: var(--color-warning, #f59e0b);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  margin: 0 auto;
}

.handoff-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.handoff-text {
  line-height: 1.4;
}
</style>
