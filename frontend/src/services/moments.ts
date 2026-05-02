import { http } from "@/utils/request";
import type {
  MomentPost,
  MomentLike,
  MomentComment,
  MomentNotification,
  PostWithDetails,
  CreatePostRequest,
  CreateCommentRequest,
  FeedQuery,
} from "@/types/moments";

export const momentsService = {
  // Post CRUD
  createPost: (data: CreatePostRequest) =>
    http.post<MomentPost>("/moments", data),

  async getFeed(query?: FeedQuery): Promise<PostWithDetails[]> {
    const response = await http.get<PostWithDetails[]>("/moments/feed", {
      params: query,
    });
    return Array.isArray(response.data) ? response.data : [];
  },

  getPost: (id: string) =>
    http.get<PostWithDetails>(`/moments/${id}`),

  deletePost: (id: string) =>
    http.delete<void>(`/moments/${id}`),

  async getUserPosts(
    userId: string,
    query?: FeedQuery,
  ): Promise<PostWithDetails[]> {
    const response = await http.get<PostWithDetails[]>(
      `/moments/user/${userId}`,
      { params: query },
    );
    return Array.isArray(response.data) ? response.data : [];
  },

  // Likes
  likePost: (postId: string) =>
    http.post<{ liked: boolean }>(`/moments/${postId}/like`),

  unlikePost: (postId: string) =>
    http.delete<void>(`/moments/${postId}/like`),

  async getLikes(postId: string): Promise<MomentLike[]> {
    const response = await http.get<MomentLike[]>(
      `/moments/${postId}/likes`,
    );
    return Array.isArray(response.data) ? response.data : [];
  },

  // Comments
  createComment: (postId: string, data: CreateCommentRequest) =>
    http.post<MomentComment>(`/moments/${postId}/comments`, data),

  deleteComment: (commentId: string) =>
    http.delete<void>(`/moments/comments/${commentId}`),

  async getComments(postId: string): Promise<MomentComment[]> {
    const response = await http.get<MomentComment[]>(
      `/moments/${postId}/comments`,
    );
    return Array.isArray(response.data) ? response.data : [];
  },

  // Notifications
  async getNotifications(): Promise<MomentNotification[]> {
    const response = await http.get<MomentNotification[]>(
      "/moments/notifications",
    );
    return Array.isArray(response.data) ? response.data : [];
  },

  markNotificationsRead: () =>
    http.put<void>("/moments/notifications/read"),
};
