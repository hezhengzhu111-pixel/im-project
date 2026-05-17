import React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { spacing } from '@/app/theme';
import type { MobileMessage } from '@/types/models';
import { MediaPreviewModal } from './MediaPreviewModal';

interface ImageBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

export function ImageBubble({ message }: ImageBubbleProps) {
  const [previewVisible, setPreviewVisible] = React.useState(false);

  const mediaUri = message.mediaUrl || message.thumbnailUrl;
  const previewUri = message.mediaUrl || message.thumbnailUrl || '';

  return (
    <>
      <Pressable
        onPress={() => setPreviewVisible(true)}
        accessibilityLabel="查看大图"
      >
        <Image
          resizeMode="cover"
          source={{ uri: mediaUri }}
          style={styles.image}
        />
      </Pressable>
      <MediaPreviewModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        mediaUrl={previewUri}
        mediaType="IMAGE"
      />
    </>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: 8,
    height: 180,
    marginBottom: spacing.sm,
    width: 180,
  },
});
