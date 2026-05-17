import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';
import type { ChatSession, Message } from '@im/shared-types';

type SessionRowProps = {
  session: ChatSession;
  onPress: () => void;
  online?: boolean;
};

const formatTime = (time?: string) => {
  if (!time) return '';
  const date = new Date(time);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

const previewMessage = (message?: Message) => {
  if (!message) return '';
  switch (message.messageType) {
    case 'IMAGE':
      return '[图片]';
    case 'FILE':
      return message.mediaName ? `[文件] ${message.mediaName}` : '[文件]';
    case 'VOICE':
      return '[语音]';
    case 'VIDEO':
      return '[视频]';
    case 'SYSTEM':
      return message.content || '[系统消息]';
    default:
      return message.content || '';
  }
};

const getAvatarText = (session: ChatSession) =>
  (session.targetName || session.conversationName || session.targetId || '?').slice(0, 1).toUpperCase();

const getSessionName = (session: ChatSession) =>
  session.targetName || session.conversationName || session.name || session.targetId || '未知会话';

const getSessionPreview = (session: ChatSession, online?: boolean) => {
  const messagePreview = previewMessage(session.lastMessage);
  if (messagePreview) return messagePreview;
  if (session.type === 'group' && session.memberCount) return `${session.memberCount} 位成员`;
  if (session.type === 'private' && online) return '在线';
  return '暂无消息';
};

export function SessionRow({ session, onPress, online = false }: SessionRowProps) {
  const unread = session.unreadCount > 0;
  const avatarUri = session.targetAvatar || session.conversationAvatar || session.avatar;
  const name = getSessionName(session);
  const time = formatTime(session.lastActiveTime || session.lastMessageTime || session.lastMessage?.sendTime);
  const isAi = Boolean(session.lastMessage?.isAiGenerated || session.lastMessage?.messageType === 'AI_REPLY');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开与 ${name} 的会话`}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={onPress}
    >
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, session.type === 'group' ? styles.groupAvatar : null]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getAvatarText(session)}</Text>
          )}
        </View>
        {session.type === 'private' ? <View style={[styles.presenceDot, online ? styles.presenceDotOnline : null]} /> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text numberOfLines={1} style={[styles.name, unread ? styles.nameUnread : null]}>{name}</Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <View style={styles.bottomLine}>
          <Text numberOfLines={1} style={[styles.preview, unread ? styles.previewUnread : null]}>{getSessionPreview(session, online)}</Text>
          <View style={styles.tags}>
            {session.isPinned ? <Text style={styles.tag}>置顶</Text> : null}
            {session.isMuted ? <Text style={styles.tag}>免打扰</Text> : null}
            {isAi ? <Text style={styles.tag}>AI</Text> : null}
            {session.encrypted ? <Text style={styles.tag}>加密</Text> : null}
          </View>
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{session.unreadCount > 99 ? '99+' : session.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
  },
  rowPressed: {
    opacity: 0.65,
  },
  avatarWrap: {
    flexShrink: 0,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  groupAvatar: {
    borderRadius: 14,
  },
  avatarImage: {
    height: 48,
    width: 48,
  },
  avatarText: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '900',
  },
  presenceDot: {
    backgroundColor: '#CBD5E1',
    borderColor: colors.surface,
    borderRadius: 6,
    borderWidth: 2,
    bottom: 0,
    height: 12,
    position: 'absolute',
    right: 0,
    width: 12,
  },
  presenceDotOnline: {
    backgroundColor: colors.success,
  },
  body: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 72,
    minWidth: 0,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
  nameUnread: {
    fontWeight: '900',
  },
  time: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '600',
  },
  bottomLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  preview: {
    color: colors.muted,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 18,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '600',
  },
  tags: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tag: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius?.pill ?? 999,
    minWidth: 19,
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 16,
  },
});
