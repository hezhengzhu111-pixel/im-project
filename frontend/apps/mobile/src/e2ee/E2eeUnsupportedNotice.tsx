import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { E2EE_SEND_DISABLED_TEXT } from './e2eeDeferred';

export function E2eeUnsupportedNotice({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <View style={styles.notice}>
      <Text style={styles.text}>{E2EE_SEND_DISABLED_TEXT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.primarySoft,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  text: {
    color: colors.encrypted,
    fontSize: typography.small,
  },
});
