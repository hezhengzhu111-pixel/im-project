import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { E2eeUnsupportedMessage } from '@/e2ee/E2eeUnsupportedMessage';
import { isEncryptedMessage } from '@/e2ee/e2eeDeferred';
import type { MobileMessage } from '@/types/models';

export function MessageBubble({
  message,
  mine,
  onRetry,
  onLongPress,
}: {
  message: MobileMessage;
  mine: boolean;
  onRetry?: () => void;
  onLongPress?: () => void;
}) {
  if (isEncryptedMessage(message)) {
    return (
      <View style={[styles.wrap, mine && styles.mineWrap]}>
        <E2eeUnsupportedMessage />
      </View>
    );
  }
  return (
    <Pressable style={[styles.wrap, mine && styles.mineWrap]} onLongPress={onLongPress}>
      {!mine && message.groupId ? <Text style={styles.sender}>{message.senderName || message.senderId}</Text> : null}
      <View style={[styles.bubble, mine && styles.mineBubble]}>
        {message.messageType === 'AI_REPLY' ? <Text style={styles.ai}>AI</Text> : null}
        <Text style={[styles.text, mine && styles.mineText]}>
          {message.content || message.mediaName || message.mediaUrl || message.messageType}
        </Text>
      </View>
      {message.status === 'FAILED' ? (
        <Pressable onPress={onRetry}>
          <Text style={styles.failed}>Failed. Tap to retry.</Text>
        </Pressable>
      ) : (
        <Text style={styles.status}>{message.status || ''}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
    maxWidth: '82%',
  },
  mineWrap: {
    alignSelf: 'flex-end',
  },
  sender: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginBottom: spacing.xs,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
  },
  mineBubble: {
    backgroundColor: colors.primary,
  },
  text: {
    color: colors.text,
    fontSize: typography.body,
  },
  mineText: {
    color: '#FFFFFF',
  },
  ai: {
    color: colors.ai,
    fontSize: typography.tiny,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  status: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  failed: {
    color: colors.danger,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
});
