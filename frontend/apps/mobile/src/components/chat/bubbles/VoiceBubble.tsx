import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { mediaService } from '@/services/media/mediaService';
import type { MobileMessage } from '@/types/models';

interface VoiceBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

/**
 * Voice message bubble with play/stop toggle.
 *
 * Playback-completion strategy: NitroSound.startPlayer returns void (no completion callback),
 * so we use a duration-based timer as fallback. duration is assumed to be in seconds.
 */
export function VoiceBubble({ message, mine }: VoiceBubbleProps) {
  const [playing, setPlaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const mediaUri = message.mediaUrl || message.thumbnailUrl;
  // duration 约定为秒
  const durationSec = message.duration;

  const clearTimer = React.useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopPlayback = React.useCallback(() => {
    clearTimer();
    try {
      mediaService.stopAudio();
    } catch {
      /* ignore stop errors */
    }
    setPlaying(false);
  }, [clearTimer]);

  // unmount 时清理 timer
  React.useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const handleToggle = React.useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }

    if (!mediaUri) {
      return;
    }

    setError(null);
    try {
      const result = mediaService.playAudio(mediaUri);
      const handleSuccess = () => {
        setPlaying(true);
        // duration-based fallback：播放自然结束后恢复为 Play
        if (durationSec != null && durationSec > 0) {
          // 如果 duration 是毫秒级（> 300 视为毫秒），兼容两种情况
          const timeoutMs = durationSec > 300 ? durationSec : durationSec * 1000;
          timerRef.current = setTimeout(() => {
            setPlaying(false);
            timerRef.current = null;
          }, timeoutMs);
        }
      };
      if (result && typeof (result as unknown as Record<string, unknown>).then === 'function') {
        (result as unknown as Promise<void>).then(
          () => handleSuccess(),
          (e: unknown) => {
            const msg = e instanceof Error ? e.message : '播放失败';
            setError(msg);
            Alert.alert('播放失败', msg);
          },
        );
      } else {
        handleSuccess();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '播放失败';
      setError(msg);
      Alert.alert('播放失败', msg);
    }
  }, [playing, mediaUri, durationSec, stopPlayback]);

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
