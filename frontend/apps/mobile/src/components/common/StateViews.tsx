import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';

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
      <View style={styles.emptyIcon}>
        <View style={styles.emptyIconBody} />
        <View style={styles.emptyIconFlag} />
        <View style={styles.emptyIconDot} />
      </View>
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
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>!</Text>
      </View>
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
      <Text style={styles.bannerText}>Network unavailable. Changes will retry when online.</Text>
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
    fontWeight: '800',
    textAlign: 'center',
  },
  muted: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.subtitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: typography.body,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  banner: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: typography.small,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    position: 'relative',
    width: 58,
  },
  emptyIconBody: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 2,
    height: 28,
    width: 44,
  },
  emptyIconFlag: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.sm,
    borderTopLeftRadius: radius.sm,
    height: 12,
    left: 6,
    position: 'absolute',
    top: 24,
    width: 6,
  },
  emptyIconDot: {
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 10,
    position: 'absolute',
    right: 10,
    top: 14,
    width: 10,
  },
  errorIcon: {
    alignItems: 'center',
    backgroundColor: '#FDECEC',
    borderRadius: radius.lg,
    height: 48,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 48,
  },
  errorIconText: {
    color: colors.danger,
    fontSize: typography.title,
    fontWeight: '900',
  },
});
