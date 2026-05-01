<template>
  <div class="empty-state">
    <div class="empty-icon">
      <slot name="icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="4" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
      </slot>
    </div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description" class="empty-desc">{{ description }}</div>
    <div v-if="$slots.action" class="empty-action">
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
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg, 16px);
  background: color-mix(in srgb, var(--color-primary, #6366f1), transparent 92%);
  color: var(--color-primary, #6366f1);
  margin-bottom: 16px;
}

.empty-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-tertiary, #94a3b8);
  line-height: 1.5;
  max-width: 280px;
  margin-bottom: 16px;
}

.empty-action {
  margin-top: 4px;
}
</style>
