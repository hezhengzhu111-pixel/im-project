<template>
  <div class="skeleton-list">
    <div v-for="n in rows" :key="n" class="skeleton-item" :class="{ 'no-animate': !animated }">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-content">
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line skeleton-line-desc"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number;
  animated?: boolean;
}>(), {
  rows: 5,
  animated: true,
});
</script>

<style scoped lang="scss">
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.skeleton-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md, 12px);
}

.skeleton-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--surface-elevated, #f1f5f9);
  flex-shrink: 0;
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
}

.skeleton-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  border-radius: var(--radius-xs, 6px);
  background: var(--surface-elevated, #f1f5f9);
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
}

.skeleton-line-title {
  width: 60%;
}

.skeleton-line-desc {
  width: 80%;
}

.no-animate .skeleton-avatar::after,
.no-animate .skeleton-line::after {
  animation: none;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-avatar::after,
  .skeleton-line::after {
    animation: none;
  }
}
</style>
