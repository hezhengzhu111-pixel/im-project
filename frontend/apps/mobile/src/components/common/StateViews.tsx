import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorIcon}>⚠️</Text>
      {title ? <Text style={styles.errorTitle}>{title}</Text> : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {onRetry ? (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>{retryLabel ?? 'Retry'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>📡 Network unavailable. Changes will retry when online.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 160,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  muted: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: typography.body,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  banner: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: typography.small,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
});
