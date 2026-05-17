import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/app/theme';
import type { MobileMessage } from '@/types/models';
import { MediaPreviewModal } from './MediaPreviewModal';

interface VideoBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

export function VideoBubble({ message }: VideoBubbleProps) {
  const [previewVisible, setPreviewVisible] = React.useState(false);

  const previewUri = message.mediaUrl || message.thumbnailUrl || '';
  const thumbnailUri = message.thumbnailUrl || message.mediaUrl;

  return (
    <>
      <Pressable
        onPress={() => setPreviewVisible(true)}
        accessibilityLabel="播放视频"
      >
        <View style={styles.videoContainer}>
          {thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.placeholder]}>
              <Text style={styles.placeholderText}>VIDEO</Text>
            </View>
          )}
          <View style={styles.playOverlay}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      </Pressable>
      <MediaPreviewModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        mediaUrl={previewUri}
        mediaType="VIDEO"
      />
    </>
  );
}

const styles = StyleSheet.create({
  videoContainer: {
    borderRadius: 8,
    height: 180,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    width: 180,
  },
  thumbnail: {
    height: 180,
    width: 180,
  },
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 12,
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
