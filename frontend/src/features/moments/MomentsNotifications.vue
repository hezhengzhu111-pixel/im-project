<template>
  <div class="moments-notifications">
    <div class="notifications-header">
      <h3>通知</h3>
      <el-button
        v-if="notifications.length > 0"
        type="primary"
        link
        @click="handleMarkAllRead"
      >
        全部已读
      </el-button>
    </div>

    <div v-if="loading" class="notifications-loading">
      <el-skeleton :rows="4" animated />
    </div>

    <div v-else-if="notifications.length === 0" class="notifications-empty">
      <el-empty description="暂无通知" />
    </div>

    <div v-else class="notifications-list">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="notification-item"
        :class="{ 'is-unread': !item.isRead }"
      >
        <el-avatar
          :size="40"
          :src="item.actorAvatar"
          class="notification-avatar"
        >
          {{ actorText(item) }}
        </el-avatar>

        <div class="notification-body">
          <div class="notification-text">
            <span class="notification-actor">
              {{ item.actorNickname || '未知用户' }}
            </span>
            <span class="notification-action">
              {{ actionText(item) }}
            </span>
          </div>
          <div class="notification-time">
            {{ formatTime(item.createdAt) }}
          </div>
        </div>

        <div v-if="!item.isRead" class="notification-dot" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMomentsStore } from '@/stores/moments'
import { formatTime, getAvatarText } from '@/utils/common'
import type { MomentNotification } from '@/types/moments'

const store = useMomentsStore()
const { notifications, loading } = storeToRefs(store)

onMounted(() => {
  store.loadNotifications()
})

function actorText(item: MomentNotification): string {
  return getAvatarText(item.actorNickname || '未知用户')
}

function actionText(item: MomentNotification): string {
  if (item.notificationType === 'like') {
    return '赞了你的动态'
  }
  return '评论了你的动态'
}

function handleMarkAllRead() {
  store.markNotificationsRead()
}
</script>

<style scoped lang="scss">
.moments-notifications {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.notifications-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-light);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.notifications-loading {
  padding: 20px;
}

.notifications-empty {
  padding: 60px 0;
}

.notifications-list {
  flex: 1;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background 0.2s ease;
  cursor: pointer;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.is-unread {
    background: var(--el-color-primary-light-9);
  }
}

.notification-avatar {
  flex-shrink: 0;
}

.notification-body {
  flex: 1;
  min-width: 0;
}

.notification-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
}

.notification-actor {
  font-weight: 500;
}

.notification-action {
  color: var(--el-text-color-secondary);
}

.notification-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.notification-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-danger);
}
</style>
