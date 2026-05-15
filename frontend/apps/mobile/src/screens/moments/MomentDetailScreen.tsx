import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoute, useNavigation, type RouteProp, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useMomentsStore } from '@/stores/momentsStore';
import { momentsService } from '@/services/moments/momentsService';
import { colors, spacing, typography } from '@/app/theme';
import type { MomentComment } from '@im/shared-types';
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

type DetailRouteProp = RouteProp<MomentsStackParamList, 'MomentDetailScreen'>;

export function MomentDetailScreen() {
  const route = useRoute<DetailRouteProp>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const postId = route.params?.postId;

  const feed = useMomentsStore((state) => state.feed);
  const createComment = useMomentsStore((state) => state.createComment);
  const deleteComment = useMomentsStore((state) => state.deleteComment);
  const deletePost = useMomentsStore((state) => state.deletePost);

  const post = feed.find((item) => item.post.id === postId) ?? feed[0];

  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<MomentComment | null>(null);
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [likes, setLikes] = useState<Array<{ nickname?: string }>>([]);
  const [loadingLikes, setLoadingLikes] = useState(false);

  const reloadComments = useCallback(() => {
    if (!post?.post.id) return;
    setLoadingComments(true);
    momentsService
      .getComments(post.post.id)
      .then((res) => {
        setComments((Array.isArray(res.data) ? res.data : []) as MomentComment[]);
      })
      .catch(() => {})
      .finally(() => {
        setLoadingComments(false);
      });
  }, [post?.post.id]);

  useEffect(() => {
    reloadComments();
    if (post?.post.id && post.likeCount && post.likeCount > 0) {
      setLoadingLikes(true);
      momentsService
        .getLikes(post.post.id)
        .then((res) => {
          setLikes((Array.isArray(res.data) ? res.data : []) as Array<{ nickname?: string }>);
        })
        .catch(() => {})
        .finally(() => {
          setLoadingLikes(false);
        });
    }
  }, [post?.post.id, post?.likeCount, reloadComments]);

  const handleDelete = () => {
    if (!post) return;
    Alert.alert('Delete Moment', 'Are you sure you want to delete this moment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deletePost(post.post.id).then(() => {
            Alert.alert('Deleted');
            navigation.goBack();
          });
        },
      },
    ]);
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert('Delete Comment', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteComment(commentId).then(() => reloadComments());
        },
      },
    ]);
  };

  const handleSubmitComment = () => {
    if (!post || !comment.trim()) return;
    setSubmitting(true);
    void createComment(post.post.id, comment.trim(), replyTo?.id)
      .then(() => {
        setComment('');
        setReplyTo(null);
        reloadComments();
      })
      .catch(() => {
        Alert.alert('Error', 'Failed to post comment');
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  if (!post) {
    return (
      <Screen title="Moment">
        <EmptyState
          title="No moment selected"
          subtitle="Go back and select a moment to view"
          actionLabel="Go Back"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const avatarLetter = (post.userNickname || post.post.userId || '?').charAt(0).toUpperCase();
  const mediaImages = post.media?.filter((m) => m.type !== 1) ?? [];

  return (
    <Screen title="Moment">
      {/* Post content */}
      <View style={styles.postSection}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.nickname}>{post.userNickname || 'Unknown'}</Text>
            <View style={styles.metaRow}>
              {post.post.createdAt ? (
                <Text style={styles.timeText}>{formatRelativeTime(post.post.createdAt)}</Text>
              ) : null}
              {post.post.location ? <Text style={styles.location}>{post.post.location}</Text> : null}
            </View>
          </View>
        </View>

        {post.post.content ? <Text style={styles.content}>{post.post.content}</Text> : null}

        {mediaImages.length > 0 ? (
          <View style={styles.mediaGrid}>
            {mediaImages.map((m, i) => (
              <View key={i} style={[styles.mediaGridItem, mediaImages.length === 1 && styles.mediaGridItemFull]}>
                <Image source={{ uri: m.url }} style={styles.mediaGridImage} resizeMode="cover" />
              </View>
            ))}
          </View>
        ) : null}

        {likes.length > 0 ? (
          <View style={styles.likeBar}>
            <Text style={styles.likeBarLabel}>Likes: </Text>
            <Text style={styles.likeBarText} numberOfLines={2}>
              {likes.map((l) => l.nickname || 'Unknown').join(', ')}
            </Text>
          </View>
        ) : loadingLikes ? (
          <Text style={styles.loadingLikesText}>Loading likes...</Text>
        ) : null}

        <View style={styles.statsRow}>
          <Text style={styles.statText}>{post.likeCount ?? 0} likes</Text>
          <Text style={styles.statText}>{post.commentCount ?? 0} comments</Text>
        </View>

        <PrimaryButton label="Delete moment" onPress={handleDelete} />
      </View>

      {/* Comment input */}
      <View style={styles.commentInputSection}>
        {replyTo ? (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText}>
              Replying to {replyTo.nickname || 'Unknown'}
            </Text>
            <Pressable onPress={() => setReplyTo(null)}>
              <Text style={styles.replyBannerCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <TextField label={replyTo ? `Reply to ${replyTo.nickname || 'Unknown'}...` : 'Write a comment'} value={comment} onChangeText={setComment} />
        <PrimaryButton label={submitting ? 'Sending...' : 'Send comment'} onPress={handleSubmitComment} />
      </View>

      {/* Comments list */}
      <View style={styles.commentsSection}>
        <Text style={styles.commentsTitle}>Comments</Text>
        {loadingComments ? (
          <LoadingState label="Loading comments..." />
        ) : comments.length === 0 ? (
          <Text style={styles.noComments}>No comments yet</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {(c.nickname || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentNickname}>{c.nickname || 'Unknown'}</Text>
                  {c.createdAt ? (
                    <Text style={styles.commentTime}>{formatRelativeTime(c.createdAt)}</Text>
                  ) : null}
                </View>
                {c.parentId ? (
                  <Text style={styles.commentReplyTag}>Reply</Text>
                ) : null}
                <Text style={styles.commentContent}>{c.content}</Text>
                <View style={styles.commentActions}>
                  <Pressable onPress={() => setReplyTo(c)} style={styles.commentActionBtn}>
                    <Text style={styles.commentActionText}>Reply</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDeleteComment(c.id)} style={styles.commentActionBtn}>
                    <Text style={[styles.commentActionText, styles.commentActionDelete]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  postSection: {
    backgroundColor: colors.surface,
    margin: spacing.lg,
    borderRadius: 12,
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
  },
  mediaGridItemFull: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaGridImage: {
    width: '100%',
    height: '100%',
  },
  likeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  likeBarLabel: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '600',
  },
  likeBarText: {
    color: colors.muted,
    fontSize: typography.small,
    flex: 1,
  },
  loadingLikesText: {
    color: colors.muted,
    fontSize: typography.small,
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.md,
  },
  statText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  commentInputSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  replyBannerText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '600',
  },
  replyBannerCancel: {
    color: colors.muted,
    fontSize: typography.small,
  },
  commentsSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  commentsTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  noComments: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  commentItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '600',
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentNickname: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '600',
  },
  commentTime: {
    color: colors.muted,
    fontSize: typography.tiny,
  },
  commentReplyTag: {
    color: colors.primary,
    fontSize: typography.tiny,
    fontWeight: '600',
    marginBottom: 2,
  },
  commentContent: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 20,
  },
  commentActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  commentActionBtn: {
    paddingVertical: spacing.xxs,
  },
  commentActionText: {
    color: colors.muted,
    fontSize: typography.tiny,
  },
  commentActionDelete: {
    color: colors.danger,
  },
});
