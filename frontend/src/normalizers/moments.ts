import type { MomentPost, PostWithDetails } from "@/types/moments";
import { asString, isRecord } from "@/types/utils";

/**
 * Normalize flat PostDto from backend into PostWithDetails.
 * Backend returns flat: { id, userId, content, visibility, ... }
 * Frontend expects nested: { post: MomentPost, media: [], likeCount, ... }
 */
export const normalizePostWithDetails = (raw: unknown): PostWithDetails | null => {
  if (!isRecord(raw)) return null;

  // If already nested (has `post` field), return as-is
  if (raw.post && isRecord(raw.post)) {
    return raw as unknown as PostWithDetails;
  }

  // Flat PostDto → build PostWithDetails
  const id = asString(raw.id);
  if (!id) return null;

  const post: MomentPost = {
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

  return {
    post,
    media: Array.isArray(raw.media) ? raw.media : [],
    likeCount: typeof raw.likeCount === "number" ? raw.likeCount : 0,
    commentCount: typeof raw.commentCount === "number" ? raw.commentCount : 0,
    isLiked: Boolean(raw.isLiked),
    userNickname: asString(raw.userNickname) || undefined,
    userAvatar: asString(raw.userAvatar) || undefined,
  };
};

export const normalizePostWithDetailsList = (raw: unknown): PostWithDetails[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizePostWithDetails)
    .filter((item): item is PostWithDetails => item != null);
};
