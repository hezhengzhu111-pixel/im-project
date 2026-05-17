import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';

export function PageContent({ children }: { children: React.ReactNode }) {
  return <View style={styles.page}>{children}</View>;
}

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>{value ?? '-'}</Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  value,
  danger,
  onPress,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger ? styles.dangerText : null]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export function AvatarText({ label, square = false }: { label: string; square?: boolean }) {
  return (
    <View style={[styles.avatar, square ? styles.avatarSquare : null]}>
      <Text style={styles.avatarText}>{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  infoRow: {
    gap: spacing.xs,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  infoValue: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
  },
  pressed: {
    opacity: 0.65,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  rowValue: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: typography.small,
    maxWidth: '48%',
  },
  chevron: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '300',
  },
  dangerText: {
    color: colors.danger,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarSquare: {
    borderRadius: radius.md,
  },
  avatarText: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '900',
  },
});
