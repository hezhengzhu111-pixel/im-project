import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import type { ChatSession } from '@/types/models';

export function SessionRow({ session, onPress }: { session: ChatSession; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(session.targetName || '?').slice(0, 1)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={styles.name}>
            {session.targetName}
          </Text>
          {session.isPinned ? <Text style={styles.flag}>Pinned</Text> : null}
          {session.isMuted ? <Text style={styles.flag}>Muted</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.preview}>
          {session.lastMessage?.content || session.lastMessage?.mediaName || 'No messages yet'}
        </Text>
      </View>
      {session.unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{session.unreadCount > 99 ? '99+' : session.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  line: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: '800',
  },
  preview: {
    color: colors.muted,
    fontSize: typography.small,
  },
  flag: {
    color: colors.primary,
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.tiny,
    fontWeight: '800',
  },
});
