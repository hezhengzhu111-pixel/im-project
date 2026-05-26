<template>
  <nav class="side-nav">
    <div class="nav-top">
      <el-avatar :src="avatar" :size="32" class="nav-avatar" />
    </div>
    <div class="nav-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="nav-btn"
        :class="{ 'nav-btn--active': activeTab === tab.key }"
        :title="tab.label"
        @click="$emit('change', tab.key)"
      >
        <el-badge :hidden="tab.unread === 0" is-dot>
          <span class="nav-icon">{{ tab.icon }}</span>
        </el-badge>
      </button>
    </div>
    <div class="nav-bottom">
      <button
        class="nav-btn"
        :class="{ 'nav-btn--active': activeTab === 'settings' }"
        title="设置"
        @click="$emit('change', 'settings')"
      >
        <span class="nav-icon">⚙</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  activeTab: string;
  avatar?: string;
  unreadChat?: number;
}>();

defineEmits<{ change: [key: string] }>();

const tabs = [
  { key: 'chat', icon: '💬', label: '聊天', unread: 0 },
  { key: 'contacts', icon: '👤', label: '通讯录', unread: 0 },
  { key: 'moments', icon: '🔍', label: '发现', unread: 0 },
];
</script>

<style lang="scss" scoped>
.side-nav {
  width: 56px;
  min-width: 56px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #1E1E1E;
  padding: var(--space-2) 0;
  user-select: none;
}

.nav-top {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: var(--space-2);
  width: 100%;
  display: flex;
  justify-content: center;
}

.nav-avatar {
  border: 2px solid transparent;
  transition: border-color var(--motion-fast);
  cursor: pointer;

  &:hover { border-color: var(--color-primary); }
}

.nav-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) 0;
}

.nav-bottom {
  padding-top: var(--space-2);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  width: 100%;
  display: flex;
  justify-content: center;
}

.nav-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all var(--motion-fast);
  position: relative;

  &:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8); }

  &--active {
    color: var(--color-primary);
    background: rgba(7, 193, 96, 0.12);

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      background: var(--color-primary);
      border-radius: 0 2px 2px 0;
    }
  }
}

.nav-icon { font-size: 20px; line-height: 1; }
</style>
