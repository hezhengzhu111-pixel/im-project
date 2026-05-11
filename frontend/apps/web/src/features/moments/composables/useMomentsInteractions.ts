import { ref } from 'vue'
import { momentsService } from '@/services/moments'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import type { MomentLike, MomentComment } from '@/types/moments'

export function useMomentsInteractions(postId: string) {
  const { capture } = useErrorHandler('moments-interactions')
  const likes = ref<MomentLike[]>([])
  const comments = ref<MomentComment[]>([])
  const loadingLikes = ref(false)
  const loadingComments = ref(false)

  async function loadLikes() {
    loadingLikes.value = true
    try {
      likes.value = await momentsService.getLikes(postId)
    } catch (error) {
      capture(error, '加载点赞列表失败')
    } finally {
      loadingLikes.value = false
    }
  }

  async function loadComments() {
    loadingComments.value = true
    try {
      comments.value = await momentsService.getComments(postId)
    } catch (error) {
      capture(error, '加载评论列表失败')
    } finally {
      loadingComments.value = false
    }
  }

  async function addComment(content: string, parentId?: string) {
    try {
      const result = await momentsService.createComment(postId, { content, parentId })
      // Reload comments to get updated list
      const updatedComments = await momentsService.getComments(postId)
      comments.value = updatedComments
      return result
    } catch (error) {
      capture(error, '评论失败')
      throw error
    }
  }

  async function removeComment(commentId: string) {
    try {
      await momentsService.deleteComment(commentId)
      comments.value = comments.value.filter(c => c.id !== commentId)
    } catch (error) {
      capture(error, '删除评论失败')
      throw error
    }
  }

  return {
    likes,
    comments,
    loadingLikes,
    loadingComments,
    loadLikes,
    loadComments,
    addComment,
    removeComment,
  }
}
