import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { momentsService } from "@/services/moments";
import type { PostWithDetails, MomentNotification } from "@/types/moments";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export const useMomentsStore = defineStore("moments", () => {
  const { capture } = useErrorHandler("moments-store");

  // State
  const feed = ref<PostWithDetails[]>([]);
  const notifications = ref<MomentNotification[]>([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  const hasMore = ref(true);

  // Getters
  const sortedFeed = computed(() =>
    [...feed.value].sort(
      (a, b) => Number(BigInt(b?.post?.id || 0) - BigInt(a?.post?.id || 0)),
    ),
  );

  // Actions
  const loadFeed = async (refresh = false) => {
    if (loading.value) return;
    if (!refresh && !hasMore.value) return;

    loading.value = true;
    try {
      const cursor = refresh
        ? undefined
        : feed.value[feed.value.length - 1]?.post.id;
      const newPosts = await momentsService.getFeed({ cursor, limit: 20 });

      if (refresh) {
        feed.value = newPosts;
      } else {
        feed.value.push(...newPosts);
      }

      hasMore.value = newPosts.length === 20;
    } catch (error) {
      capture(error, "加载朋友圈动态失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const addPost = (post: PostWithDetails) => {
    feed.value.unshift(post);
  };

  const removePost = (postId: string) => {
    feed.value = feed.value.filter((p) => p.post.id !== postId);
  };

  const toggleLike = async (postId: string) => {
    const post = feed.value.find((p) => p.post.id === postId);
    if (!post) return;

    try {
      if (post.isLiked) {
        await momentsService.unlikePost(postId);
        post.isLiked = false;
        post.likeCount--;
      } else {
        await momentsService.likePost(postId);
        post.isLiked = true;
        post.likeCount++;
      }
    } catch (error) {
      capture(error, "操作点赞失败");
      throw error;
    }
  };

  const loadNotifications = async () => {
    try {
      notifications.value = await momentsService.getNotifications();
      unreadCount.value = notifications.value.filter((n) => !n.isRead).length;
    } catch (error) {
      capture(error, "加载通知失败");
      throw error;
    }
  };

  const markNotificationsRead = async () => {
    try {
      await momentsService.markNotificationsRead();
      notifications.value.forEach((n) => (n.isRead = true));
      unreadCount.value = 0;
    } catch (error) {
      capture(error, "标记通知已读失败");
      throw error;
    }
  };

  return {
    feed,
    notifications,
    unreadCount,
    loading,
    hasMore,
    sortedFeed,
    loadFeed,
    addPost,
    removePost,
    toggleLike,
    loadNotifications,
    markNotificationsRead,
  };
});
