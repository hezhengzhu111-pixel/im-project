import { http } from '@/services/api/httpClient';

export const momentsService = {
  createPost: (data: Record<string, unknown>) => http.post('/moments', data),
  getFeed: (query?: Record<string, unknown>) => http.get<unknown[]>('/moments/feed', { params: query } as never),
  getPost: (id: string) => http.get(`/moments/${id}`),
  deletePost: (id: string) => http.delete<void>(`/moments/${id}`),
  addMedia: (postId: string, media: { url: string; type?: number; sortOrder?: number }[]) =>
    http.post<void>(`/moments/${postId}/media`, { media }),
  getUserPosts: (userId: string, query?: Record<string, unknown>) =>
    http.get<unknown[]>(`/moments/user/${userId}`, { params: query } as never),
  likePost: (postId: string) => http.post<{ liked: boolean }>(`/moments/${postId}/like`),
  unlikePost: (postId: string) => http.delete<void>(`/moments/${postId}/like`),
  getLikes: (postId: string) => http.get<unknown[]>(`/moments/${postId}/likes`),
  createComment: (postId: string, data: { content: string; parentId?: string }) =>
    http.post(`/moments/${postId}/comments`, data),
  deleteComment: (commentId: string) => http.delete<void>(`/moments/comments/${commentId}`),
  getComments: (postId: string) => http.get<unknown[]>(`/moments/${postId}/comments`),
  getNotifications: () => http.get<unknown[]>('/moments/notifications'),
  markNotificationsRead: () => http.put<void>('/moments/notifications/read'),
};
