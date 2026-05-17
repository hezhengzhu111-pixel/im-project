import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '@/app/theme';
import type { MobileMessage } from '@/types/models';

interface TextBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

export function TextBubble({ message, mine }: TextBubbleProps) {
  const displayContent =
    message.content || message.mediaName || message.mediaUrl || message.messageType;
  return (
    <Text style={[styles.text, mine && styles.mineText]}>
      {displayContent}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.text,
    fontSize: typography.body,
  },
  mineText: {
    color: '#FFFFFF',
  },
});
