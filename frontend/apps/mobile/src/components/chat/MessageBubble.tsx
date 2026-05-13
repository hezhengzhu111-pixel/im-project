import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import { colors, spacing, typography } from '@/app/theme';
import { E2eeUnsupportedMessage } from '@/e2ee/E2eeUnsupportedMessage';
import { isEncryptedMessage } from '@/e2ee/e2eeDeferred';
import { mediaService } from '@/services/media/mediaService';
import { platformLinking } from '@/services/platform/linking';
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
  const [playing, setPlaying] = React.useState(false);
  if (isEncryptedMessage(message)) {
    return (
      <View style={[styles.wrap, mine && styles.mineWrap]}>
        <E2eeUnsupportedMessage />
      </View>
    );
  }
  const mediaUri = message.mediaUrl || message.thumbnailUrl;
  return (
    <Pressable style={[styles.wrap, mine && styles.mineWrap]} onLongPress={onLongPress}>
      {!mine && message.groupId ? <Text style={styles.sender}>{message.senderName || message.senderId}</Text> : null}
      <View style={[styles.bubble, mine && styles.mineBubble]}>
        {message.messageType === 'AI_REPLY' ? <Text style={styles.ai}>AI</Text> : null}
        {message.messageType === 'IMAGE' && mediaUri ? (
          <Image resizeMode="cover" source={{ uri: mediaUri }} style={styles.image} />
        ) : null}
        {message.messageType === 'VIDEO' && mediaUri ? (
          <Video controls paused source={{ uri: mediaUri }} style={styles.video} />
        ) : null}
        {message.messageType === 'VOICE' && mediaUri ? (
          <Pressable
            style={styles.mediaAction}
            onPress={() => {
              if (playing) {
                void mediaService.stopAudio();
                setPlaying(false);
                return;
              }
              void mediaService.playAudio(mediaUri);
              setPlaying(true);
            }}
          >
            <Text style={[styles.mediaActionText, mine && styles.mineText]}>
              {playing ? 'Stop voice' : 'Play voice'}
            </Text>
          </Pressable>
        ) : null}
        {message.messageType === 'FILE' && mediaUri ? (
          <Pressable
            style={styles.mediaAction}
            onPress={() => {
              if (mediaUri.startsWith('http://') || mediaUri.startsWith('https://')) {
                void platformLinking.openUrl(mediaUri);
                return;
              }
              void platformLinking.openFile(mediaUri.replace('file://', ''), message.extra?.mimeType as string | undefined);
            }}
          >
            <Text style={[styles.mediaActionText, mine && styles.mineText]}>Open file</Text>
          </Pressable>
        ) : null}
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
  image: {
    borderRadius: 8,
    height: 180,
    marginBottom: spacing.sm,
    width: 180,
  },
  video: {
    borderRadius: 8,
    height: 180,
    marginBottom: spacing.sm,
    width: 180,
  },
  mediaAction: {
    marginBottom: spacing.sm,
  },
  mediaActionText: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '700',
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
