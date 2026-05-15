import { MOMENTS_ENDPOINTS } from '@im/shared-api-contract';
import type { ApiResponse, MomentComment, MomentLike, MomentNotification, PostWithDetails } from '@im/shared-types';
import {
  normalizeMomentComment,
  normalizePostWithDetails,
  normalizePostWithDetailsList,
  normalizeMomentCommentList,
  normalizeMomentLikeList,
  normalizeMomentNotificationList,
} from '@im/shared-normalizers';
import { http } from '@/services/api/httpClient';

export const momentsService = {
  async createPost(data: Record<string, unknown>): Promise<ApiResponse<PostWithDetails | null>> {
    const response = await http.post<unknown>(MOMENTS_ENDPOINTS.CREATE, data);
    return { ...response, data: normalizePostWithDetails(response.data) };
  },

  async getFeed(query?: Record<string, unknown>): Promise<PostWithDetails[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.FEED, { params: query } as never);
    return normalizePostWithDetailsList(response.data);
  },

  async getPost(id: string): Promise<PostWithDetails | null> {
    const response = await http.get(MOMENTS_ENDPOINTS.POST_BY_ID.replace(':postId', id));
    return normalizePostWithDetails(response.data);
  },

  deletePost: (id: string) =>
    http.delete<void>(MOMENTS_ENDPOINTS.DELETE_POST.replace(':postId', id)),

  addMedia: (postId: string, media: { url: string; type?: number; sortOrder?: number }[]) =>
    http.post<void>(MOMENTS_ENDPOINTS.ADD_MEDIA.replace(':postId', postId), { media }),

  async getUserPosts(userId: string, query?: Record<string, unknown>): Promise<PostWithDetails[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.USER_POSTS.replace(':userId', userId), { params: query } as never);
    return normalizePostWithDetailsList(response.data);
  },

  likePost: (postId: string) =>
    http.post<{ liked: boolean }>(MOMENTS_ENDPOINTS.LIKE.replace(':postId', postId)),

  unlikePost: (postId: string) =>
    http.delete<void>(MOMENTS_ENDPOINTS.UNLIKE.replace(':postId', postId)),

  async getLikes(postId: string): Promise<MomentLike[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.LIKES.replace(':postId', postId));
    return normalizeMomentLikeList(response.data);
  },

  async createComment(postId: string, data: { content: string; parentId?: string }): Promise<ApiResponse<MomentComment | null>> {
    const response = await http.post<unknown>(MOMENTS_ENDPOINTS.CREATE_COMMENT.replace(':postId', postId), data);
    return { ...response, data: normalizeMomentComment(response.data) };
  },

  deleteComment: (commentId: string) =>
    http.delete<void>(MOMENTS_ENDPOINTS.DELETE_COMMENT.replace(':commentId', commentId)),

  async getComments(postId: string): Promise<MomentComment[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.COMMENTS.replace(':postId', postId));
    return normalizeMomentCommentList(response.data);
  },

  async getNotifications(): Promise<MomentNotification[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.NOTIFICATIONS);
    return normalizeMomentNotificationList(response.data);
  },

  markNotificationsRead: () =>
    http.put<void>(MOMENTS_ENDPOINTS.MARK_NOTIFICATIONS_READ),
};
