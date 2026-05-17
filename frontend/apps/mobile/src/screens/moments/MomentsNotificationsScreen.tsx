import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import { useMomentsStore } from '@/stores/momentsStore';
import { momentsService } from '@/services/moments/momentsService';
import { colors, spacing, typography } from '@/app/theme';
import type { MomentNotification } from '@im/shared-types';

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export function MomentsNotificationsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const notifications = useMomentsStore((state) => state.notifications);
  const loading = useMomentsStore((state) => state.loading);
  const loadNotifications = useMomentsStore((state) => state.loadNotifications);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkAllRead = () => {
    void momentsService.markNotificationsRead().then(() => {
      void loadNotifications();
    });
  };

  const handlePressNotification = (notif: MomentNotification) => {
    if (notif.postId) {
      navigation.navigate('MomentDetailScreen', { postId: notif.postId });
    }
  };

  const renderContent = () => {
    if (loading) {
      return <LoadingState label="正在加载通知..." />;
    }

    if (notifications.length === 0) {
      return (
        <EmptyState
          title="暂无通知"
          subtitle="有人点赞或评论你的动态时，会显示在这里"
        />
      );
    }

    return (
      <View style={styles.list}>
        {notifications.map((notif, index) => {
          const isLike = notif.notificationType === 'like';
          return (
            <Pressable
              key={notif.id || index}
              style={[styles.item, !notif.isRead && styles.itemUnread]}
              onPress={() => handlePressNotification(notif)}
            >
              <View style={styles.itemAvatar}>
                <Text style={styles.itemAvatarText}>
                  {(notif.actorNickname || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemText}>
                  <Text style={styles.actorName}>{notif.actorNickname || '未知用户'}</Text>
                  {isLike ? ' 点赞了你的动态' : ' 评论了你的动态'}
                </Text>
                {notif.createdAt ? (
                  <Text style={styles.itemTime}>{formatRelativeTime(notif.createdAt)}</Text>
                ) : null}
              </View>
              {!notif.isRead ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <Screen title="动态通知">
      {notifications.length > 0 ? (
        <View style={styles.headerActions}>
          <Pressable style={styles.markReadBtn} onPress={handleMarkAllRead}>
            <Text style={styles.markReadText}>全部标为已读</Text>
          </Pressable>
        </View>
      ) : null}
      {renderContent()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  markReadBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  markReadText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '600',
  },
  list: {
    marginTop: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.md,
  },
  itemUnread: {
    backgroundColor: colors.primarySoft,
  },
  itemAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarText: {
    color: colors.muted,
    fontSize: typography.body,
    fontWeight: '600',
  },
  itemBody: {
    flex: 1,
  },
  itemText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 20,
  },
  itemTime: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginTop: 2,
  },
  actorName: {
    fontWeight: '600',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
});
