import type { MomentMedia, MomentPost, PostWithDetails } from "@/types/moments";
import { asString, isRecord } from "@/types/utils";

const normalizePost = (raw: unknown): MomentPost | null => {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    userId: asString(raw.userId),
    content: asString(raw.content) || undefined,
    visibility: (raw.visibility as 0 | 1 | 2) ?? 0,
    linkUrl: asString(raw.linkUrl) || undefined,
    linkTitle: asString(raw.linkTitle) || undefined,
    linkCover: asString(raw.linkCover) || undefined,
    location: asString(raw.location) || undefined,
    status: (raw.status as 0 | 1) ?? 0,
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
};

const normalizeMedia = (raw: unknown): MomentMedia | null => {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    postId: asString(raw.postId),
    type: (raw.type as 0 | 1) ?? 0,
    url: asString(raw.url),
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
  };
};

/**
 * Normalize API response into PostWithDetails.
 * Handles both:
 * - Nested format: { post: {...}, media: [...], likeCount, ... }
 * - Flat format:   { id, userId, content, ... } (legacy)
 */
export const normalizePostWithDetails = (raw: unknown): PostWithDetails | null => {
  if (!isRecord(raw)) return null;

  // Nested format (from enriched backend)
  if (raw.post && isRecord(raw.post)) {
    const post = normalizePost(raw.post);
    if (!post) return null;
    return {
      post,
      media: Array.isArray(raw.media)
        ? raw.media.map(normalizeMedia).filter((m): m is MomentMedia => m != null)
        : [],
      likeCount: typeof raw.likeCount === "number" ? raw.likeCount : 0,
      commentCount: typeof raw.commentCount === "number" ? raw.commentCount : 0,
      isLiked: Boolean(raw.isLiked),
      userNickname: asString(raw.userNickname) || undefined,
      userAvatar: asString(raw.userAvatar) || undefined,
    };
  }

  // Flat format (fallback)
  const post = normalizePost(raw);
  if (!post) return null;
  return {
    post,
    media: [],
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
  };
};

export const normalizePostWithDetailsList = (raw: unknown): PostWithDetails[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizePostWithDetails)
    .filter((item): item is PostWithDetails => item != null);
};
