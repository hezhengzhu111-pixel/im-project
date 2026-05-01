<template>
  <button
    type="button"
    class="encryption-badge"
    :class="{ 'is-expanded': expanded }"
    @click="emit('toggle')"
  >
    <span class="badge-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
    <span class="badge-text">端对端加密</span>
    <span class="badge-status"></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  expanded?: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
}>();
</script>

<style scoped lang="scss">
.encryption-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid color-mix(in srgb, var(--color-success, #22c55e), transparent 70%);
  background: color-mix(in srgb, var(--color-success, #22c55e), transparent 92%);
  color: var(--color-success, #22c55e);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--motion-fast, 0.15s) ease, border-color var(--motion-fast, 0.15s) ease;

  &:hover {
    background: color-mix(in srgb, var(--color-success, #22c55e), transparent 85%);
    border-color: color-mix(in srgb, var(--color-success, #22c55e), transparent 50%);
  }

  &.is-expanded {
    background: color-mix(in srgb, var(--color-success, #22c55e), transparent 85%);
  }
}

.badge-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.badge-text {
  white-space: nowrap;
}

.badge-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success, #22c55e);
  flex-shrink: 0;
}
</style>
