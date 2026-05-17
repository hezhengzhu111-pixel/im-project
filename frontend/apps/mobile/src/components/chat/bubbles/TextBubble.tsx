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
  SYSTEM: '系统消息',
  AI_REPLY: '智能回复',
};

export function TextBubble({ message, mine }: TextBubbleProps) {
  if (message.messageType !== 'TEXT' && message.messageType !== 'SYSTEM' && message.messageType !== 'AI_REPLY') {
    return null;
  }

  const displayContent = message.content || messageTypeFallback[message.messageType] || '消息';

  return <Text style={[styles.text, mine && styles.mineText]}>{displayContent}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
  },
  mineText: {
    color: '#FFFFFF',
  },
});
