<template>
  <div class="moments-comments">
    <!-- Comment input -->
    <div class="comment-input-wrapper">
      <el-input
        v-model="commentText"
        placeholder="写评论..."
        :rows="2"
        type="textarea"
        resize="none"
        @keydown.enter.exact.prevent="handleSubmitComment"
      />
      <el-button
        type="primary"
        size="small"
        :disabled="!commentText.trim()"
        :loading="submitting"
        @click="handleSubmitComment"
      >
        发送
      </el-button>
    </div>

    <!-- Comments list -->
    <div v-if="loadingComments" class="comments-loading">
      <el-skeleton :rows="3" animated />
    </div>

    <div v-else-if="comments.length === 0" class="comments-empty">
      暂无评论
    </div>

    <div v-else class="comments-list">
      <div
        v-for="comment in comments"
        :key="comment.id"
        class="comment-item"
      >
        <el-avatar
          :size="32"
          :src="comment.avatar"
          class="comment-avatar"
        >
          {{ getAvatarText(comment.nickname || '未知用户') }}
        </el-avatar>

        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-nickname">{{ comment.nickname || '未知用户' }}</span>
            <span class="comment-time">{{ formatTime(comment.createdAt) }}</span>
          </div>
          <div class="comment-content">{{ comment.content }}</div>
          <div v-if="comment.parentId" class="comment-reply-hint">
            回复了评论
          </div>
        </div>

        <el-button
          v-if="isCommentOwner(comment)"
          type="danger"
          size="small"
          text
          class="comment-delete-btn"
          @click="handleDeleteComment(comment.id)"
        >
          删除
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useMomentsInteractions } from './composables/useMomentsInteractions'
import { formatTime, getAvatarText } from '@/utils/common'
import type { MomentComment } from '@/types/moments'

const props = defineProps<{
  postId: string
}>()

const userStore = useUserStore()
const { comments, loadingComments, loadComments, addComment, removeComment } =
  useMomentsInteractions(props.postId)

const commentText = ref('')
const submitting = ref(false)

onMounted(() => {
  loadComments()
})

const isCommentOwner = (comment: MomentComment) => {
  return userStore.currentUser?.id === comment.userId
}

const handleSubmitComment = async () => {
  const content = commentText.value.trim()
  if (!content) return

  submitting.value = true
  try {
    await addComment(content)
    commentText.value = ''
  } catch {
    // Error handled by composable
  } finally {
    submitting.value = false
  }
}

const handleDeleteComment = async (commentId: string) => {
  try {
    await ElMessageBox.confirm('确定要删除这条评论吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await removeComment(commentId)
  } catch {
    // User cancelled or error handled by composable
  }
}
</script>

<style scoped lang="scss">
.moments-comments {
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.comment-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 12px;

  .el-input {
    flex: 1;
  }
}

.comments-loading,
.comments-empty {
  padding: 12px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.comment-avatar {
  flex-shrink: 0;
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-nickname {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-color-primary);
}

.comment-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.comment-content {
  font-size: 14px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.comment-reply-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.comment-delete-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;

  .comment-item:hover & {
    opacity: 1;
  }
}
</style>
