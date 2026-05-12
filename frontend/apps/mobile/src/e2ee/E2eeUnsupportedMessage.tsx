import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { E2EE_UNSUPPORTED_TEXT } from './e2eeDeferred';

export function E2eeUnsupportedMessage() {
  return (
    <View style={styles.card}>
      <Text style={styles.text}>{E2EE_UNSUPPORTED_TEXT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  text: {
    color: colors.encrypted,
    fontSize: typography.small,
  },
});
