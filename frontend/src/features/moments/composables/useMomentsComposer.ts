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
      // 1. Create the post first
      const result = await momentsService.createPost(data)
      const postId =
        result && typeof result === 'object' && 'data' in result
          ? (result as { data: { id: string } }).data.id
          : (result as unknown as { id: string }).id

      // 2. Upload media files and collect URLs
      if (files && files.length > 0) {
        const mediaItems: { url: string; type: number; sortOrder: number }[] = []

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const isVideo = file.type.startsWith('video/')
          const isImage = file.type.startsWith('image/')

          let uploadResult
          if (isImage) {
            uploadResult = await fileService.uploadImage(file)
          } else if (isVideo) {
            uploadResult = await fileService.uploadVideo(file)
          } else {
            uploadResult = await fileService.upload(file)
          }

          // uploadResult is ApiResponse<FileUploadResponse>, URL is at data.url
          const url =
            uploadResult && typeof uploadResult === 'object' && 'data' in uploadResult
              ? (uploadResult as { data: { url: string } }).data.url || ''
              : ''

          if (url) {
            mediaItems.push({
              url,
              type: isVideo ? 1 : 0,
              sortOrder: i,
            })
          }
        }

        // 3. Associate media with the post
        if (mediaItems.length > 0) {
          await momentsService.addMedia(postId, mediaItems)
        }
      }

      // 4. Fetch the complete post with details and add to feed
      const post = await momentsService.getPost(postId)
      if (post) {
        store.addPost(post)
      }
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
