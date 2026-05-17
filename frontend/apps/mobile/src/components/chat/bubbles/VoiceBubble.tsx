import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';
import { mediaService } from '@/services/media/mediaService';
import { resolveMediaUri } from '@/services/media/mediaUri';
import type { MobileMessage } from '@/types/models';

interface VoiceBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

const normalizeDuration = (duration?: number) => {
  if (duration == null || duration <= 0) return 0;
  return duration > 300 ? Math.max(1, Math.round(duration / 1000)) : Math.round(duration);
};

const waveBars = [8, 13, 18, 13, 8];

export function VoiceBubble({ message, mine }: VoiceBubbleProps) {
  const [playing, setPlaying] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawUri = message.mediaUrl || message.thumbnailUrl || message.content || '';
  const mediaUri = resolveMediaUri(rawUri, 'VOICE');
  const durationSec = normalizeDuration(message.duration);
  const width = Math.min(210, Math.max(96, 76 + durationSec * 6));

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
      // ignore stop errors
    }
    setPlaying(false);
  }, [clearTimer]);

  React.useEffect(() => () => clearTimer(), [clearTimer]);

  const handleToggle = React.useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }

    if (!mediaUri) return;

    try {
      const result = mediaService.playAudio(mediaUri);
      const handleSuccess = () => {
        setPlaying(true);
        if (durationSec > 0) {
          timerRef.current = setTimeout(() => {
            setPlaying(false);
            timerRef.current = null;
          }, durationSec * 1000);
        }
      };
      if (result && typeof (result as unknown as Record<string, unknown>).then === 'function') {
        (result as unknown as Promise<void>).then(
          handleSuccess,
          (e: unknown) => {
            Alert.alert('播放失败', e instanceof Error ? e.message : '语音文件暂时无法播放');
          },
        );
      } else {
        handleSuccess();
      }
    } catch (e) {
      Alert.alert('播放失败', e instanceof Error ? e.message : '语音文件暂时无法播放');
    }
  }, [durationSec, mediaUri, playing, stopPlayback]);

  return (
    <Pressable
      accessibilityLabel={playing ? '停止语音' : '播放语音'}
      style={[styles.voice, mine ? styles.voiceMine : styles.voiceOther, { width }]}
      onPress={handleToggle}
    >
      {!mine ? <View style={styles.tailLeft} /> : <View style={styles.tailRight} />}
      <View style={styles.iconWrap}>
        <Text style={[styles.playIcon, mine ? styles.mineText : null]}>{playing ? '■' : '▶'}</Text>
      </View>
      <View style={styles.wave}>
        {waveBars.map((height, index) => (
          <View
            key={`${height}-${index}`}
            style={[
              styles.waveBar,
              { height },
              mine ? styles.waveBarMine : null,
              playing && index % 2 === 0 ? styles.waveBarActive : null,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.duration, mine ? styles.mineText : null]}>{durationSec > 0 ? `${durationSec}″` : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voice: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    position: 'relative',
  },
  voiceOther: {
    backgroundColor: colors.surface,
  },
  voiceMine: {
    backgroundColor: colors.primary,
  },
  tailLeft: {
    backgroundColor: colors.surface,
    height: 10,
    left: -3,
    position: 'absolute',
    top: 14,
    transform: [{ rotate: '45deg' }],
    width: 10,
  },
  tailRight: {
    backgroundColor: colors.primary,
    height: 10,
    position: 'absolute',
    right: -3,
    top: 14,
    transform: [{ rotate: '45deg' }],
    width: 10,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
  },
  playIcon: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '900',
  },
  wave: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  waveBar: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    opacity: 0.45,
    width: 3,
  },
  waveBarMine: {
    backgroundColor: '#FFFFFF',
  },
  waveBarActive: {
    opacity: 1,
  },
  duration: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'right',
  },
  mineText: {
    color: '#FFFFFF',
  },
});
