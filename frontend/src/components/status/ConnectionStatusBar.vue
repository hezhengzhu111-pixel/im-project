<template>
  <Transition name="status-slide">
    <div
      v-if="connectionStatus !== 'connected'"
      class="connection-status-bar"
      :class="connectionStatus"
    >
      <span class="status-dot-bar"></span>
      <span class="status-text">{{ statusLabel }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useWebSocketStore } from "@/stores/websocket";
import { useI18nStore } from "@/stores/i18n";

const webSocketStore = useWebSocketStore();
const { t } = useI18nStore();

const connectionStatus = computed(() => webSocketStore.connectionStatus);

const statusLabel = computed(() => {
  switch (connectionStatus.value) {
    case "connecting":
      return t("chat.connecting");
    case "disconnected":
      return t("chat.offline");
    default:
      return "";
  }
});
</script>

<style scoped lang="scss">
.connection-status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  z-index: 1000;
}

.connection-status-bar.connecting {
  background: color-mix(
    in srgb,
    var(--color-warning, #f59e0b),
    transparent 90%
  );
  color: var(--color-warning, #f59e0b);
  border-bottom: 1px solid
    color-mix(in srgb, var(--color-warning, #f59e0b), transparent 70%);
}

.connection-status-bar.disconnected {
  background: color-mix(in srgb, var(--color-danger, #ef4444), transparent 90%);
  color: var(--color-danger, #ef4444);
  border-bottom: 1px solid
    color-mix(in srgb, var(--color-danger, #ef4444), transparent 70%);
}

.status-dot-bar {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.connection-status-bar.connecting .status-dot-bar {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.status-slide-enter-active,
.status-slide-leave-active {
  transition: all var(--motion-normal, 180ms) var(--motion-ease, ease);
}

.status-slide-enter-from,
.status-slide-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .status-dot-bar {
    animation: none;
  }
}
</style>
