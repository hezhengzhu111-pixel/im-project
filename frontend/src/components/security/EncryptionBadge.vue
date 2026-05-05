<template>
  <button
    type="button"
    class="encryption-badge"
    :class="[
      `badge-${status}`,
      { 'is-expanded': expanded },
    ]"
    @click="emit('toggle')"
  >
    <span class="badge-icon">
      <svg
        v-if="status === 'negotiating'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="spin"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <svg
        v-else
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
    <span class="badge-text">{{ label }}</span>
    <span class="badge-status"></span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { E2eeSessionStatus } from "@/features/e2ee/types";

const props = defineProps<{
  status: E2eeSessionStatus;
  expanded?: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
}>();

const label = computed(() => {
  switch (props.status) {
    case "plaintext":
      return "未启用端到端加密";
    case "negotiating":
      return "正在协商加密";
    case "encrypted":
      return "端到端加密已启用";
    case "failed":
      return "端到端加密异常";
    default:
      return "端对端加密";
  }
});
</script>

<style scoped lang="scss">
.encryption-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full, 999px);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--motion-fast, 0.15s) ease,
    border-color var(--motion-fast, 0.15s) ease;
}

.badge-encrypted {
  border: 1px solid
    color-mix(in srgb, var(--color-success, #22c55e), transparent 70%);
  background: color-mix(
    in srgb,
    var(--color-success, #22c55e),
    transparent 92%
  );
  color: var(--color-success, #22c55e);

  &:hover {
    background: color-mix(
      in srgb,
      var(--color-success, #22c55e),
      transparent 85%
    );
  }

  &.is-expanded {
    background: color-mix(
      in srgb,
      var(--color-success, #22c55e),
      transparent 85%
    );
  }
}

.badge-negotiating {
  border: 1px solid
    color-mix(in srgb, var(--color-warning, #f59e0b), transparent 70%);
  background: color-mix(
    in srgb,
    var(--color-warning, #f59e0b),
    transparent 92%
  );
  color: var(--color-warning, #f59e0b);

  &:hover {
    background: color-mix(
      in srgb,
      var(--color-warning, #f59e0b),
      transparent 85%
    );
  }
}

.badge-failed {
  border: 1px solid
    color-mix(in srgb, var(--color-danger, #ef4444), transparent 70%);
  background: color-mix(
    in srgb,
    var(--color-danger, #ef4444),
    transparent 92%
  );
  color: var(--color-danger, #ef4444);

  &:hover {
    background: color-mix(
      in srgb,
      var(--color-danger, #ef4444),
      transparent 85%
    );
  }
}

.badge-plaintext {
  border: 1px solid var(--border-light);
  background: var(--surface-elevated);
  color: var(--text-tertiary);

  &:hover {
    background: var(--surface-overlay);
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
  flex-shrink: 0;

  .badge-encrypted & {
    background: var(--color-success, #22c55e);
  }

  .badge-negotiating & {
    background: var(--color-warning, #f59e0b);
  }

  .badge-failed & {
    background: var(--color-danger, #ef4444);
  }

  .badge-plaintext & {
    background: var(--text-tertiary);
    opacity: 0.5;
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
