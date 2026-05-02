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
import {
  normalizePostWithDetails,
  normalizePostWithDetailsList,
} from "@/normalizers/moments";

export const momentsService = {
  // Post CRUD
  createPost: (data: CreatePostRequest) =>
    http.post<MomentPost>("/moments", data),

  async getFeed(query?: FeedQuery): Promise<PostWithDetails[]> {
    const response = await http.get("/moments/feed", {
      params: query,
    });
    return normalizePostWithDetailsList(response.data);
  },

  async getPost(id: string): Promise<PostWithDetails | null> {
    const response = await http.get(`/moments/${id}`);
    return normalizePostWithDetails(response.data);
  },

  deletePost: (id: string) =>
    http.delete<void>(`/moments/${id}`),

  addMedia: (postId: string, media: { url: string; type?: number; sortOrder?: number }[]) =>
    http.post<void>(`/moments/${postId}/media`, { media }),

  async getUserPosts(
    userId: string,
    query?: FeedQuery,
  ): Promise<PostWithDetails[]> {
    const response = await http.get(`/moments/user/${userId}`, {
      params: query,
    });
    return normalizePostWithDetailsList(response.data);
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
  createComment: (postId: string, data: CreateCommentRequest) => {
    const body: Record<string, unknown> = { content: data.content };
    if (data.parentId != null) {
      body.parentId = String(data.parentId);
    }
    return http.post<MomentComment>(`/moments/${postId}/comments`, body);
  },

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
