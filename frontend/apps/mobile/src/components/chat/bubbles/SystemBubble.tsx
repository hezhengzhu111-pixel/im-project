import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '@/app/theme';
import type { MobileMessage } from '@/types/models';

interface SystemBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

export function SystemBubble({ message }: SystemBubbleProps) {
  return (
    <Text style={styles.systemText}>
      {message.content || ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  systemText: {
    color: colors.muted,
    fontSize: typography.small,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
