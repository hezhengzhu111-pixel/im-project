/**
 * Moments (朋友圈) TypeScript type definitions
 * Matches Rust backend DTOs with serde(rename_all = "camelCase")
 */

export interface MomentPost {
  id: string;
  userId: string;
  content?: string;
  visibility: 0 | 1 | 2; // 0=public, 1=friends, 2=private
  linkUrl?: string;
  linkTitle?: string;
  linkCover?: string;
  location?: string;
  status: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface MomentMedia {
  id: string;
  postId: string;
  type: 0 | 1; // 0=image, 1=video
  url: string;
  sortOrder: number;
}

export interface MomentLike {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
  nickname?: string;
  avatar?: string;
}

export interface MomentComment {
  id: string;
  postId: string;
  userId: string;
  parentId?: string;
  content: string;
  createdAt: string;
  nickname?: string;
  avatar?: string;
}

export interface MomentNotification {
  id: string;
  userId: string;
  actorId: string;
  notificationType: 'like' | 'comment';
  postId: string;
  commentId?: string;
  isRead: boolean;
  createdAt: string;
  actorNickname?: string;
  actorAvatar?: string;
}

export interface PostWithDetails {
  post: MomentPost;
  media: MomentMedia[];
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  userNickname?: string;
  userAvatar?: string;
}

export interface CreatePostRequest {
  content?: string;
  visibility?: 0 | 1 | 2;
  linkUrl?: string;
  linkTitle?: string;
  linkCover?: string;
  location?: string;
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string;
}

export interface FeedQuery {
  cursor?: string;
  limit?: number;
}
