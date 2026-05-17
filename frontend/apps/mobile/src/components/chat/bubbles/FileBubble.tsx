import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { platformLinking } from '@/services/platform/linking';
import type { MobileMessage } from '@/types/models';

interface FileBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileBubble({ message, mine }: FileBubbleProps) {
  const mediaUri = message.mediaUrl || message.thumbnailUrl;

  const handlePress = React.useCallback(async () => {
    if (!mediaUri) {
      return;
    }

    try {
      if (mediaUri.startsWith('http://') || mediaUri.startsWith('https://')) {
        await platformLinking.openUrl(mediaUri);
      } else {
        const localPath = mediaUri.startsWith('file://')
          ? mediaUri.replace('file://', '')
          : mediaUri;
        const mimeType = (message.extra?.mimeType as string) || undefined;
        await platformLinking.openFile(localPath, mimeType);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '打开文件失败';
      Alert.alert('打开失败', msg);
    }
  }, [mediaUri, message.extra]);

  const fileName = message.mediaName || '未知文件';
  const sizeLabel = formatFileSize(message.mediaSize);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      accessibilityLabel="打开文件"
    >
      <View style={styles.row}>
        <Text style={[styles.icon]}>📄</Text>
        <View style={styles.info}>
          <Text
            style={[styles.fileName, mine && styles.mineText]}
            numberOfLines={1}
          >
            {fileName}
          </Text>
          {sizeLabel ? (
            <Text style={[styles.fileSize, mine && styles.mineTextSecondary]}>
              {sizeLabel}
            </Text>
          ) : null}
        </View>
      </View>
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
    fontSize: 24,
    marginRight: spacing.xs,
  },
  info: {
    flexShrink: 1,
  },
  fileName: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '700',
  },
  fileSize: {
    color: colors.primary,
    fontSize: typography.tiny,
    opacity: 0.7,
  },
  mineText: {
    color: '#FFFFFF',
  },
  mineTextSecondary: {
    color: 'rgba(255,255,255,0.7)',
  },
});
