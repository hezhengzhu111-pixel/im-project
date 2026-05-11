<template>
  <div class="moments-comments">
    <!-- Comment input -->
    <div class="comment-input-wrapper">
      <div v-if="replyTo" class="reply-hint">
        回复 <span class="reply-target">{{ replyTo.nickname || '未知用户' }}</span>
        <button class="reply-cancel" @click="cancelReply">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <el-input
        ref="inputRef"
        v-model="commentText"
        :placeholder="replyTo ? `回复 ${replyTo.nickname || '未知用户'}...` : '写评论...'"
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
          <div class="comment-content">
            <span v-if="comment.parentId" class="comment-reply-tag">
              回复 {{ getParentNickname(comment.parentId) }}：
            </span>
            {{ comment.content }}
          </div>
          <div class="comment-actions">
            <button class="reply-btn" @click="startReply(comment)">回复</button>
            <button
              v-if="isCommentOwner(comment)"
              class="delete-btn"
              @click="handleDeleteComment(comment.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { Close } from '@element-plus/icons-vue'
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
const replyTo = ref<MomentComment | null>(null)
const inputRef = ref<{ focus: () => void } | null>(null)

onMounted(() => {
  loadComments()
})

const isCommentOwner = (comment: MomentComment) => {
  return userStore.currentUser?.id === comment.userId
}

const getParentNickname = (parentId: string) => {
  const parent = comments.value.find((c) => c.id === parentId)
  return parent?.nickname || '未知用户'
}

const startReply = (comment: MomentComment) => {
  replyTo.value = comment
  commentText.value = ''
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const cancelReply = () => {
  replyTo.value = null
}

const handleSubmitComment = async () => {
  const content = commentText.value.trim()
  if (!content) return

  submitting.value = true
  try {
    await addComment(content, replyTo.value?.id)
    commentText.value = ''
    replyTo.value = null
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
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;

  .el-input {
    flex: 1;
  }
}

.reply-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 4px 8px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.reply-target {
  color: var(--el-color-primary);
  font-weight: 500;
}

.reply-cancel {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  padding: 2px;
  display: flex;
  align-items: center;

  &:hover {
    color: var(--el-text-color-primary);
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

.comment-reply-tag {
  color: var(--el-color-primary);
  font-weight: 500;
}

.comment-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.reply-btn,
.delete-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  color: var(--el-text-color-secondary);
  transition: color 0.15s ease;

  &:hover {
    color: var(--el-color-primary);
  }
}

.delete-btn:hover {
  color: var(--el-color-danger);
}

@media (max-width: 768px) {
  .moments-comments {
    gap: 6px;
    font-size: 13px;
  }

  .comment-input-wrapper .el-input :deep(.el-textarea__inner) {
    font-size: 16px;
    min-height: 44px;
  }
}
</style>
