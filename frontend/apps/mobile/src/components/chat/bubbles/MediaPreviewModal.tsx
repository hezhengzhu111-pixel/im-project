import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video from 'react-native-video';
import { spacing } from '@/app/theme';

interface MediaPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
}

export function MediaPreviewModal({
  visible,
  onClose,
  mediaUrl,
  mediaType,
}: MediaPreviewModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          accessibilityLabel="关闭预览"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {mediaType === 'IMAGE' ? (
          <Image
            source={{ uri: mediaUrl }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        ) : (
          <Video
            source={{ uri: mediaUrl }}
            style={styles.fullVideo}
            controls
            resizeMode="contain"
            paused={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fullVideo: {
    width: '100%',
    height: '70%',
  },
});
