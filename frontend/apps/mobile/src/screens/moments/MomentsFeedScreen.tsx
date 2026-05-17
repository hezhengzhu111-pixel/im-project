import React, { useEffect, useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useMomentsStore } from '@/stores/momentsStore';
import { colors, spacing, typography } from '@/app/theme';
import type { PostWithDetails } from '@im/shared-types';

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function MediaGrid({ media }: { media: Array<{ url: string; type?: number }> }) {
  const images = media.filter((m) => m.type !== 1);
  if (images.length === 0) return null;
  const display = images.slice(0, 4);
  const overflow = images.length - 4;
  return (
    <View style={styles.mediaGrid}>
      {display.map((m, i) => (
        <View
          key={i}
          style={[
            styles.mediaGridItem,
            display.length === 1 && styles.mediaGridItemFull,
            display.length === 2 && styles.mediaGridItemHalf,
            display.length === 3 && i === 0 && styles.mediaGridItemLarge,
          ]}
        >
          <Image source={{ uri: m.url }} style={styles.mediaGridImage} resizeMode="cover" />
          {i === 3 && overflow > 0 ? (
            <View style={styles.mediaOverflow}>
              <Text style={styles.mediaOverflowText}>+{overflow}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function PostCard({
  item,
  onToggleLike,
  onPress,
}: {
  item: PostWithDetails;
  onToggleLike: () => void;
  onPress: () => void;
}) {
  const avatarLetter = (item.userNickname || item.post.userId || '?').charAt(0).toUpperCase();
  const mediaCount = item.media?.length ?? 0;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.nickname}>{item.userNickname || '未知用户'}</Text>
          <View style={styles.metaRow}>
            {item.post.createdAt ? (
              <Text style={styles.timeText}>{formatRelativeTime(item.post.createdAt)}</Text>
            ) : null}
            {item.post.location ? (
              <Text style={styles.location}>{item.post.location}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {item.post.content ? <Text style={styles.content}>{item.post.content}</Text> : null}

      {mediaCount > 0 && item.media ? <MediaGrid media={item.media} /> : null}

      {item.post.linkUrl ? (
        <View style={styles.linkCard}>
          <Text style={styles.linkTitle} numberOfLines={1}>
            {item.post.linkTitle || item.post.linkUrl}
          </Text>
        </View>
      ) : null}

      {item.likeCount && item.likeCount > 0 ? (
        <View style={styles.likeBar}>
          <Text style={styles.likeBarText}>
            {item.likeCount} 人点赞
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={[styles.actionBtn, item.isLiked && styles.actionBtnLiked]} onPress={onToggleLike}>
          <Text style={[styles.actionText, item.isLiked && styles.actionTextLiked]}>
            {item.isLiked ? '已点赞' : '点赞'} {item.likeCount ? `(${item.likeCount})` : ''}
          </Text>
        </Pressable>
        <View style={styles.actionBtn}>
          <Text style={styles.actionText}>
            评论 {item.commentCount ? `(${item.commentCount})` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function MomentsFeedScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const feed = useMomentsStore((state) => state.feed);
  const loading = useMomentsStore((state) => state.loading);
  const hasMore = useMomentsStore((state) => state.hasMore);
  const error = useMomentsStore((state) => state.error);
  const loadFeed = useMomentsStore((state) => state.loadFeed);
  const toggleLike = useMomentsStore((state) => state.toggleLike);

  useEffect(() => {
    void loadFeed(true);
  }, [loadFeed]);

  const handleEndReached = useCallback(() => {
    if (!loading && hasMore) {
      void loadFeed(false);
    }
  }, [loading, hasMore, loadFeed]);

  const renderFooter = () => {
    if (loading && feed.length > 0) {
      return <LoadingState label="正在加载更多..." />;
    }
    if (!hasMore && feed.length > 0) {
      return <Text style={styles.footerText}>没有更多动态</Text>;
    }
    return null;
  };

  const renderEmpty = () => {
    if (loading) {
      return <LoadingState label="正在加载动态..." />;
    }
    if (error) {
      return (
        <ErrorState
          title="加载失败"
          message={error}
          retryLabel="重试"
          onRetry={() => { loadFeed(true); }}
        />
      );
    }
    return (
      <EmptyState
        title="暂无动态"
        subtitle="发布第一条动态，记录这一刻"
        actionLabel="发布动态"
        onAction={() => navigation.navigate('CreateMomentScreen')}
      />
    );
  };

  return (
    <Screen
      title="动态"
      scroll={false}
      refreshing={loading && feed.length > 0}
      onRefresh={() => {
        void loadFeed(true);
      }}
      right={
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => navigation.navigate('MomentsNotificationsScreen')}
          >
            <Text style={styles.headerBtnText}>通知</Text>
          </Pressable>
          <PrimaryButton label="发布" onPress={() => navigation.navigate('CreateMomentScreen')} />
        </View>
      }
    >
      <FlatList
        data={feed}
        keyExtractor={(item) => item.post.id}
        renderItem={({ item }) => (
          <PostCard
            item={item}
            onToggleLike={() => { toggleLike(item.post.id); }}
            onPress={() => navigation.navigate('MomentDetailScreen', { postId: item.post.id })}
          />
        )}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={feed.length === 0 ? styles.emptyList : styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  headerBtnText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '600',
  },
  list: {
    paddingBottom: spacing.xl,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 8,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  userInfo: {
    marginLeft: spacing.md,
    flex: 1,
  },
  nickname: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  timeText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  location: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: 2,
  },
  content: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  mediaGridItem: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaGridItemFull: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaGridItemHalf: {
    width: '49%',
  },
  mediaGridItemLarge: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaGridImage: {
    width: '100%',
    height: '100%',
  },
  mediaOverflow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaOverflowText: {
    color: '#FFFFFF',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  likeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  likeBarText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  linkCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  linkTitle: {
    color: colors.primary,
    fontSize: typography.small,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xl,
  },
  actionBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  actionBtnLiked: {
    backgroundColor: colors.primarySoft,
  },
  actionText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  actionTextLiked: {
    color: colors.primary,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: typography.small,
    paddingVertical: spacing.lg,
  },
});
