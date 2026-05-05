<template>
  <div class="moments-like-bar">
    <div class="like-header">
      <el-icon class="like-icon"><StarFilled /></el-icon>
      <span v-if="loadingLikes" class="like-loading">加载中...</span>
      <span v-else-if="likes.length === 0" class="like-empty">暂无点赞</span>
    </div>
    <div v-if="likes.length > 0" class="like-list">
      <span
        v-for="(like, index) in likes"
        :key="like.id"
        class="like-user"
      >
        <span class="like-nickname">{{ like.nickname || '未知用户' }}</span>
        <span v-if="index < likes.length - 1" class="like-separator">,</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { StarFilled } from '@element-plus/icons-vue'
import { useMomentsInteractions } from './composables/useMomentsInteractions'

const props = defineProps<{
  postId: string
}>()

const { likes, loadingLikes, loadLikes } = useMomentsInteractions(props.postId)

onMounted(() => {
  loadLikes()
})
</script>

<style scoped lang="scss">
.moments-like-bar {
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.like-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.like-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}

.like-loading,
.like-empty {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.like-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.like-user {
  font-size: 14px;
  color: var(--el-color-primary);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.like-nickname {
  font-size: 14px;
}

.like-separator {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}

@media (max-width: 768px) {
  .moments-like-bar {
    gap: 6px;
    font-size: 13px;
  }
}
</style>
