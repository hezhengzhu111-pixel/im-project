import { ref } from 'vue'
import { momentsService } from '@/services/moments'
import { useMomentsStore } from '@/stores/moments'
import { fileService } from '@/services/file'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import type { CreatePostRequest } from '@/types/moments'

export function useMomentsComposer() {
  const store = useMomentsStore()
  const { capture } = useErrorHandler('moments-composer')
  const loading = ref(false)

  async function publish(data: CreatePostRequest, files?: File[]) {
    loading.value = true
    try {
      // Upload media files first if any
      if (files && files.length > 0) {
        for (const file of files) {
          const isVideo = file.type.startsWith('video/')
          const isImage = file.type.startsWith('image/')

          if (isImage) {
            await fileService.uploadImage(file)
          } else if (isVideo) {
            await fileService.uploadVideo(file)
          } else {
            await fileService.upload(file)
          }
        }
      }

      const result = await momentsService.createPost(data)
      // Handle both ApiResponse wrapped and unwrapped responses
      const postId =
        result && typeof result === 'object' && 'data' in result
          ? (result as { data: { id: string } }).data.id
          : (result as unknown as { id: string }).id

      const post = await momentsService.getPost(postId)
      store.addPost(post as any)
      return true
    } catch (error) {
      capture(error, '发布动态失败')
      throw error
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    publish,
  }
}
