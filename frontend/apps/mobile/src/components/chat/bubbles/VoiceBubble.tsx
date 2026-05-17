import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { mediaService } from '@/services/media/mediaService';
import type { MobileMessage } from '@/types/models';

interface VoiceBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

export function VoiceBubble({ message, mine }: VoiceBubbleProps) {
  const [playing, setPlaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mediaUri = message.mediaUrl || message.thumbnailUrl;
  const durationSec = message.duration;

  const handleToggle = React.useCallback(() => {
    if (playing) {
      try {
        mediaService.stopAudio();
      } catch {
        /* ignore stop errors */
      }
      setPlaying(false);
      return;
    }

    if (!mediaUri) {
      return;
    }

    setError(null);
    try {
      const result = mediaService.playAudio(mediaUri);
      if (result && typeof (result as unknown as Record<string, unknown>).then === 'function') {
        (result as unknown as Promise<void>).then(
          () => setPlaying(true),
          (e: unknown) => {
            const msg = e instanceof Error ? e.message : '播放失败';
            setError(msg);
            Alert.alert('播放失败', msg);
          },
        );
      } else {
        setPlaying(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '播放失败';
      setError(msg);
      Alert.alert('播放失败', msg);
    }
  }, [playing, mediaUri]);

  return (
    <Pressable
      onPress={handleToggle}
      style={styles.container}
      accessibilityLabel={playing ? '停止语音' : '播放语音'}
    >
      <View style={styles.row}>
        <Text style={[styles.icon, mine && styles.mineText]}>
          {playing ? '⏹' : '🔊'}
        </Text>
        <Text style={[styles.label, mine && styles.mineText]}>
          {playing ? '停止' : '播放语音'}
        </Text>
        {durationSec != null && durationSec > 0 ? (
          <Text style={[styles.duration, mine && styles.mineText]}>
            {Math.round(durationSec)}″
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.errorText, mine && styles.mineText]}>
          {error}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  label: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '700',
  },
  duration: {
    color: colors.primary,
    fontSize: typography.tiny,
    marginLeft: spacing.sm,
    opacity: 0.7,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  mineText: {
    color: '#FFFFFF',
  },
});
