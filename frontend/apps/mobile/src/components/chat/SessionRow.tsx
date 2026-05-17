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
  if (session.type === 'private' && online) return '当前在线';
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
      style={({ pressed }) => [
        styles.row,
        session.isPinned ? styles.rowPinned : null,
        unread ? styles.rowUnread : null,
        pressed ? styles.rowPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.accent} />
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getAvatarText(session)}</Text>
          )}
        </View>
        {session.type === 'private' ? (
          <View style={[styles.presenceDot, online ? styles.presenceDotOnline : null]} />
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.topLine}>
          <View style={styles.nameWrap}>
            <Text numberOfLines={1} style={[styles.name, unread ? styles.nameUnread : null]}>
              {name}
            </Text>
            <View style={styles.flags}>
              {session.isPinned ? <Text style={styles.flag}>置顶</Text> : null}
              {session.isMuted ? <Text style={styles.flagMuted}>免打扰</Text> : null}
              {isAi ? <Text style={styles.aiTag}>智能</Text> : null}
            </View>
          </View>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>

        <View style={styles.metaLine}>
          <Text style={[styles.presenceText, online ? styles.presenceTextOnline : null]}>
            {session.type === 'group'
              ? `${session.memberCount || 0} 位成员`
              : online
                ? '在线'
                : '离线'}
          </Text>
          {session.encrypted ? <Text style={styles.secureText}>加密</Text> : null}
        </View>

        <View style={styles.previewLine}>
          <Text numberOfLines={1} style={[styles.preview, unread ? styles.previewUnread : null]}>
            {getSessionPreview(session, online)}
          </Text>
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
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    position: 'relative',
  },
  rowPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.995 }],
  },
  rowPinned: {
    backgroundColor: colors.surfaceAlt,
  },
  rowUnread: {
    backgroundColor: colors.primarySoft,
    borderColor: '#D6E8FF',
  },
  accent: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    bottom: spacing.md,
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: spacing.md,
    width: 3,
  },
  avatarWrap: {
    flexShrink: 0,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  avatarImage: {
    height: 44,
    width: 44,
  },
  avatarText: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '800',
  },
  presenceDot: {
    backgroundColor: '#CBD5E1',
    borderColor: colors.surface,
    borderRadius: 6,
    borderWidth: 2,
    bottom: 1,
    height: 12,
    position: 'absolute',
    right: 1,
    width: 12,
  },
  presenceDotOnline: {
    backgroundColor: colors.success,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  nameWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
  nameUnread: {
    fontWeight: '800',
  },
  flags: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flag: {
    color: colors.primary,
    fontSize: typography.tiny,
    fontWeight: '800',
  },
  flagMuted: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  aiTag: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    color: colors.primary,
    fontSize: typography.tiny,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  time: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: typography.tiny,
    fontWeight: '600',
  },
  metaLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  presenceText: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '600',
  },
  presenceTextOnline: {
    color: colors.success,
  },
  secureText: {
    color: colors.encrypted,
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  previewLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.tiny,
    fontWeight: '900',
  },
});
