import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';

export function LoadingState({ label = '加载中...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="small" />
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
      <View style={styles.emptyDot} />
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
      <View style={styles.errorDot} />
      {title ? <Text style={styles.errorTitle}>{title}</Text> : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {onRetry ? (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>{retryLabel ?? '重试'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>网络不可用，恢复后将自动重试</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    textAlign: 'center',
  },
  muted: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.body,
    fontWeight: '800',
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  banner: {
    backgroundColor: '#FFF7E6',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    color: '#AD6800',
    fontSize: typography.small,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDot: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 48,
    width: 48,
  },
  errorDot: {
    backgroundColor: '#FFECEC',
    borderRadius: radius.pill,
    height: 48,
    width: 48,
  },
});
