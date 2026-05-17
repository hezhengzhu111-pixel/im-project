import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '@/app/theme';
import type { MobileMessage } from '@/types/models';

interface TextBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

const messageTypeFallback: Record<string, string> = {
  TEXT: '消息',
  IMAGE: '图片',
  VIDEO: '视频',
  VOICE: '语音',
  FILE: '文件',
  SYSTEM: '系统消息',
  AI_REPLY: '智能回复',
};

export function TextBubble({ message, mine }: TextBubbleProps) {
  const displayContent =
    message.content || message.mediaName || message.mediaUrl || messageTypeFallback[message.messageType] || '消息';
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
