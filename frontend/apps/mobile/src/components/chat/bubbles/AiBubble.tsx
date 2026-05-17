import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import type { MobileMessage } from '@/types/models';

interface AiBubbleProps {
  message: MobileMessage;
  mine: boolean;
}

export function AiBubble({ message, mine }: AiBubbleProps) {
  const displayContent = message.content || '';
  return (
    <View>
      <Text style={styles.aiBadge}>AI</Text>
      <Text style={[styles.text, mine && styles.mineText]}>
        {displayContent}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  aiBadge: {
    color: colors.ai,
    fontSize: typography.tiny,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  text: {
    color: colors.text,
    fontSize: typography.body,
  },
  mineText: {
    color: '#FFFFFF',
  },
});
