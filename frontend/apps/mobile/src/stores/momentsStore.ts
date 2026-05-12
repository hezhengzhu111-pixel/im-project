import { create } from 'zustand';
import { momentsService } from '@/services/moments/momentsService';
import type { MobileFile } from '@/services/file/fileService';
import { uploadService } from '@/services/upload/uploadService';

interface MomentPost {
  post: { id: string; content?: string; userId?: string };
  media?: Array<{ url: string; type?: number }>;
  likeCount?: number;
  commentCount?: number;
  isLiked?: boolean;
}

interface MomentsState {
  feed: MomentPost[];
  notifications: unknown[];
  loading: boolean;
  hasMore: boolean;
  loadFeed: (refresh?: boolean) => Promise<void>;
  createPost: (content: string, files?: MobileFile[]) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  createComment: (postId: string, content: string, parentId?: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  loadNotifications: () => Promise<void>;
}

export const useMomentsStore = create<MomentsState>((set, get) => ({
  feed: [],
  notifications: [],
  loading: false,
  hasMore: true,

  async loadFeed(refresh = false) {
    if (get().loading) {
      return;
    }
    set({ loading: true });
    try {
      const currentFeed = get().feed;
      const cursor = refresh ? undefined : currentFeed.length > 0 ? currentFeed[currentFeed.length - 1].post.id : undefined;
      const response = await momentsService.getFeed({ cursor, limit: 20 });
      const next = (Array.isArray(response.data) ? response.data : []) as MomentPost[];
      set({
        feed: refresh ? next : [...get().feed, ...next],
        hasMore: next.length === 20,
      });
    } finally {
      set({ loading: false });
    }
  },

  async createPost(content, files = []) {
    const created = await momentsService.createPost({ content });
    const postId = String((created.data as { id?: string })?.id || '');
    if (postId && files.length > 0) {
      const media = [];
      for (let index = 0; index < files.length; index += 1) {
        const uploaded = await uploadService.uploadFile(files[index], 'IMAGE');
        media.push({ url: uploaded.url, type: 0, sortOrder: index });
      }
      await momentsService.addMedia(postId, media);
    }
    await get().loadFeed(true);
  },

  async deletePost(postId) {
    await momentsService.deletePost(postId);
    set({ feed: get().feed.filter((item) => item.post.id !== postId) });
  },

  async toggleLike(postId) {
    const post = get().feed.find((item) => item.post.id === postId);
    if (!post) {
      return;
    }
    if (post.isLiked) {
      await momentsService.unlikePost(postId);
    } else {
      await momentsService.likePost(postId);
    }
    set({
      feed: get().feed.map((item) =>
        item.post.id === postId
          ? {
              ...item,
              isLiked: !item.isLiked,
              likeCount: Math.max(0, (item.likeCount || 0) + (item.isLiked ? -1 : 1)),
            }
          : item,
      ),
    });
  },

  async createComment(postId, content, parentId) {
    await momentsService.createComment(postId, { content, parentId });
    await get().loadFeed(true);
  },

  async deleteComment(commentId) {
    await momentsService.deleteComment(commentId);
    await get().loadFeed(true);
  },

  async loadNotifications() {
    const response = await momentsService.getNotifications();
    set({ notifications: response.data });
  },
}));
