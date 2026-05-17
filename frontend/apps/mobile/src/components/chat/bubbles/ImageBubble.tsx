import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';
import type { MobileMessage } from '@/types/models';
import { mediaCache } from '@/services/media/mediaCache';
import { resolveMediaUri } from '@/services/media/mediaUri';
import { MediaPreviewModal } from './MediaPreviewModal';

interface ImageBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

const IMAGE_CACHE_RETRY_DELAYS_MS = [0, 500, 1500, 3000];

const extraString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function ImageBubble({ message, mine }: ImageBubbleProps) {
  const [previewVisible, setPreviewVisible] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [imageUri, setImageUri] = React.useState('');
  const [previewUri, setPreviewUri] = React.useState('');

  const rawUri = message.thumbnailUrl || message.mediaUrl || message.content || '';
  const localFallbackRawUri =
    extraString(message.extra?.localMediaUri) ||
    extraString(message.extra?.localThumbnailUri) ||
    extraString(message.extra?.originalUri);
  const localFallbackUri = resolveMediaUri(localFallbackRawUri, 'IMAGE');
  const resolvedImageUri = resolveMediaUri(rawUri, 'IMAGE');
  const resolvedPreviewUri = resolveMediaUri(message.mediaUrl || rawUri, 'IMAGE') || localFallbackUri;
  const label = message.mediaName || String(rawUri || localFallbackRawUri).split('/').filter(Boolean).pop() || '图片';

  React.useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => {
        if (delayMs <= 0) {
          resolve();
          return;
        }
        retryTimer = setTimeout(resolve, delayMs);
      });

    const sourceUri = resolvedImageUri || localFallbackUri;
    setLoadFailed(false);
    setPreviewUri(resolvedPreviewUri);
    setImageUri(localFallbackUri || '');

    if (!sourceUri) {
      setLoadFailed(true);
      return () => {
        cancelled = true;
        if (retryTimer) clearTimeout(retryTimer);
      };
    }

    const loadImage = async (attemptIndex: number): Promise<void> => {
      await wait(IMAGE_CACHE_RETRY_DELAYS_MS[attemptIndex] ?? 0);
      if (cancelled) return;

      try {
        const localUri = await mediaCache.imageUri(sourceUri);
        if (!cancelled) {
          setImageUri(localUri || sourceUri);
          setLoadFailed(false);
        }
      } catch {
        if (cancelled) return;
        const nextAttempt = attemptIndex + 1;
        if (nextAttempt < IMAGE_CACHE_RETRY_DELAYS_MS.length) {
          await loadImage(nextAttempt);
          return;
        }
        if (localFallbackUri && sourceUri !== localFallbackUri) {
          setImageUri(localFallbackUri);
          setLoadFailed(false);
          return;
        }
        setImageUri('');
        setLoadFailed(true);
      }
    };

    void loadImage(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [resolvedImageUri, resolvedPreviewUri, localFallbackUri]);

  if (!imageUri || loadFailed) {
    return (
      <View style={[styles.placeholder, mine ? styles.placeholderMine : null]}>
        <Text numberOfLines={1} style={[styles.placeholderTitle, mine ? styles.mineText : null]}>图片</Text>
        <Text numberOfLines={2} style={[styles.placeholderSubtitle, mine ? styles.mineTextSecondary : null]}>{loadFailed ? '图片加载失败' : label}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setPreviewVisible(true)} accessibilityLabel="查看大图">
        <Image resizeMode="cover" source={{ uri: imageUri }} style={styles.image} onError={() => { setImageUri(''); setLoadFailed(true); }} />
      </Pressable>
      <MediaPreviewModal visible={previewVisible} onClose={() => setPreviewVisible(false)} mediaUrl={previewUri || imageUri} mediaType="IMAGE" />
    </>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radius.md,
    height: 180,
    width: 180,
  },
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 92,
    padding: spacing.md,
    width: 180,
  },
  placeholderMine: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  placeholderSubtitle: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
  },
  mineText: {
    color: '#FFFFFF',
  },
  mineTextSecondary: {
    color: 'rgba(255,255,255,0.78)',
  },
});
