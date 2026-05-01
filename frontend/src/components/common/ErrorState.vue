<template>
  <div class="error-state">
    <div class="error-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
    <div class="error-title">{{ title }}</div>
    <div v-if="description" class="error-desc">{{ description }}</div>
    <div v-if="$slots.action" class="error-action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<style scoped lang="scss">
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg, 16px);
  background: color-mix(in srgb, var(--color-danger, #ef4444), transparent 92%);
  color: var(--color-danger, #ef4444);
  margin-bottom: 16px;
}

.error-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  margin-bottom: 6px;
}

.error-desc {
  font-size: 13px;
  color: var(--text-tertiary, #94a3b8);
  line-height: 1.5;
  max-width: 280px;
  margin-bottom: 16px;
}

.error-action {
  margin-top: 4px;
}
</style>
