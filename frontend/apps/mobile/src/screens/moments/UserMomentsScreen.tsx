import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoute, useNavigation, type RouteProp, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState, ErrorState } from '@/components/common/StateViews';
import { momentsService } from '@/services/moments/momentsService';
import { colors, spacing, typography } from '@/app/theme';
import type { PostWithDetails } from '@im/shared-types';
import type { MomentsStackParamList } from '@/app/navigation/MomentsNavigator';

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

type UserRouteProp = RouteProp<MomentsStackParamList, 'UserMomentsScreen'>;

export function UserMomentsScreen() {
  const route = useRoute<UserRouteProp>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const userId = route.params?.userId;

  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadPosts = useCallback(
    (refresh = false) => {
      if (!userId) return;
      if (loading) return;
      if (!refresh && !hasMore) return;

      setLoading(true);
      setError(null);
      const cursor = refresh ? undefined : posts[posts.length - 1]?.post.id;

      momentsService
        .getUserPosts(userId, { cursor, limit: 20 })
        .then((res) => {
          const next = (Array.isArray(res.data) ? res.data : []) as PostWithDetails[];
          setPosts(refresh ? next : [...posts, ...next]);
          setHasMore(next.length === 20);
        })
        .catch(() => {
          setError('Failed to load posts');
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [userId, loading, hasMore, posts],
  );

  useEffect(() => {
    void loadPosts(true);
  }, [userId, loadPosts]);

  const userNickname = posts[0]?.userNickname || userId || 'Unknown';
  const avatarLetter = userNickname.charAt(0).toUpperCase();

  const renderHeader = () => (
    <View style={styles.profileHeader}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarLetter}</Text>
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.nickname}>{userNickname}</Text>
        <Text style={styles.postCount}>{posts.length} moment{posts.length !== 1 ? 's' : ''}</Text>
      </View>
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonText}>Profile coming soon</Text>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return <LoadingState label="Loading moments..." />;
    if (error) return <ErrorState title="Failed to load" message={error} retryLabel="Retry" onRetry={() => { loadPosts(true); }} />;
    return <EmptyState title="No moments" subtitle="This user hasn't posted anything yet" />;
  };

  const renderFooter = () => {
    if (loading && posts.length > 0) return <LoadingState label="Loading more..." />;
    if (!hasMore && posts.length > 0) return <Text style={styles.footerText}>No more moments</Text>;
    return null;
  };

  return (
    <Screen title={userNickname} scroll={false}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.post.id}
        renderItem={({ item }) => {
          const mediaImages = item.media?.filter((m: { type?: number }) => m.type !== 1) ?? [];
          return (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('MomentDetailScreen', { postId: item.post.id })}
            >
              {item.post.createdAt ? (
                <Text style={styles.timeText}>{formatRelativeTime(item.post.createdAt)}</Text>
              ) : null}
              {item.post.content ? <Text style={styles.content}>{item.post.content}</Text> : null}
              {mediaImages.length > 0 ? (
                <View style={styles.mediaGrid}>
                  {mediaImages.slice(0, 4).map((m: { url: string }, i: number) => (
                    <View key={i} style={[styles.mediaGridItem, mediaImages.length === 1 && styles.mediaGridItemFull]}>
                      <Image source={{ uri: m.url }} style={styles.mediaGridImage} resizeMode="cover" />
                      {i === 3 && mediaImages.length > 4 ? (
                        <View style={styles.mediaOverflow}>
                          <Text style={styles.mediaOverflowText}>+{mediaImages.length - 4}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.statsRow}>
                <Text style={styles.statText}>{item.likeCount ?? 0} likes</Text>
                <Text style={styles.statText}>{item.commentCount ?? 0} comments</Text>
              </View>
            </Pressable>
          );
        }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={() => { loadPosts(false); }}
        onEndReachedThreshold={0.3}
        contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.xl,
  },
  emptyList: {
    flexGrow: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontSize: typography.title,
    fontWeight: '700',
  },
  profileInfo: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  nickname: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  postCount: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: 2,
  },
  comingSoonBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  comingSoonText: {
    color: colors.muted,
    fontSize: typography.tiny,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 12,
    padding: spacing.lg,
  },
  timeText: {
    color: colors.muted,
    fontSize: typography.small,
    marginBottom: spacing.xs,
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  statText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  footerText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: typography.small,
    paddingVertical: spacing.lg,
  },
});
