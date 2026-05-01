<template>
  <div class="ai-status-badge" :class="statusClass">
    <span class="ai-status-dot"></span>
    <span class="ai-status-text">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import {computed} from "vue";

const props = defineProps<{
  autoReplyEnabled?: boolean;
  hasHumanIntervention?: boolean;
}>();

const statusClass = computed(() => {
  if (props.hasHumanIntervention) return "is-human";
  if (props.autoReplyEnabled) return "is-active";
  return "is-inactive";
});

const statusText = computed(() => {
  if (props.hasHumanIntervention) return "人工已接管";
  if (props.autoReplyEnabled) return "AI 助手在线";
  return "AI 暂停";
});
</script>

<style scoped lang="scss">
.ai-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full, 999px);
  font-size: 12px;
  font-weight: 600;
  transition: background-color var(--motion-fast, 0.15s) ease;
}

.ai-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

// AI active — green
.ai-status-badge.is-active {
  background: color-mix(in srgb, var(--color-success, #22c55e), transparent 90%);
  color: var(--color-success, #22c55e);
  border: 1px solid color-mix(in srgb, var(--color-success, #22c55e), transparent 70%);

  .ai-status-dot {
    background: var(--color-success, #22c55e);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-success, #22c55e), transparent 50%);
  }
}

// Human intervention — orange
.ai-status-badge.is-human {
  background: color-mix(in srgb, var(--color-warning, #f59e0b), transparent 90%);
  color: var(--color-warning, #f59e0b);
  border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b), transparent 70%);

  .ai-status-dot {
    background: var(--color-warning, #f59e0b);
  }
}

// AI inactive — gray
.ai-status-badge.is-inactive {
  background: var(--surface-elevated);
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);

  .ai-status-dot {
    background: var(--text-placeholder);
  }
}
</style>
