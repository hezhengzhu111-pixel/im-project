import { http } from "@/utils/request";
import { MOMENTS_ENDPOINTS } from "@im/shared-api-contract";
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
  normalizeMomentLikeList,
  normalizeMomentCommentList,
  normalizeMomentNotificationList,
} from "@/normalizers/moments";

export const momentsService = {
  // Post CRUD
  createPost: (data: CreatePostRequest) =>
    http.post<MomentPost>(MOMENTS_ENDPOINTS.CREATE, data),

  async getFeed(query?: FeedQuery): Promise<PostWithDetails[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.FEED, {
      params: query,
    });
    return normalizePostWithDetailsList(response.data);
  },

  async getPost(id: string): Promise<PostWithDetails | null> {
    const response = await http.get(MOMENTS_ENDPOINTS.POST_BY_ID.replace(":postId", id));
    return normalizePostWithDetails(response.data);
  },

  deletePost: (id: string) =>
    http.delete<void>(MOMENTS_ENDPOINTS.DELETE_POST.replace(":postId", id)),

  addMedia: (postId: string, media: { url: string; type?: number; sortOrder?: number }[]) =>
    http.post<void>(MOMENTS_ENDPOINTS.ADD_MEDIA.replace(":postId", postId), { media }),

  async getUserPosts(
    userId: string,
    query?: FeedQuery,
  ): Promise<PostWithDetails[]> {
    const response = await http.get(MOMENTS_ENDPOINTS.USER_POSTS.replace(":userId", userId), {
      params: query,
    });
    return normalizePostWithDetailsList(response.data);
  },

  // Likes
  likePost: (postId: string) =>
    http.post<{ liked: boolean }>(MOMENTS_ENDPOINTS.LIKE.replace(":postId", postId)),

  unlikePost: (postId: string) =>
    http.delete<void>(MOMENTS_ENDPOINTS.UNLIKE.replace(":postId", postId)),

  async getLikes(postId: string): Promise<MomentLike[]> {
    const response = await http.get(
      MOMENTS_ENDPOINTS.LIKES.replace(":postId", postId),
    );
    return normalizeMomentLikeList(response.data);
  },

  // Comments
  createComment: (postId: string, data: CreateCommentRequest) => {
    const body: Record<string, unknown> = { content: data.content };
    if (data.parentId != null) {
      body.parentId = String(data.parentId);
    }
    return http.post<MomentComment>(MOMENTS_ENDPOINTS.CREATE_COMMENT.replace(":postId", postId), body);
  },

  deleteComment: (commentId: string) =>
    http.delete<void>(MOMENTS_ENDPOINTS.DELETE_COMMENT.replace(":commentId", commentId)),

  async getComments(postId: string): Promise<MomentComment[]> {
    const response = await http.get(
      MOMENTS_ENDPOINTS.COMMENTS.replace(":postId", postId),
    );
    return normalizeMomentCommentList(response.data);
  },

  // Notifications
  async getNotifications(): Promise<MomentNotification[]> {
    const response = await http.get(
      MOMENTS_ENDPOINTS.NOTIFICATIONS,
    );
    return normalizeMomentNotificationList(response.data);
  },

  markNotificationsRead: () =>
    http.put<void>(MOMENTS_ENDPOINTS.MARK_NOTIFICATIONS_READ),
};
