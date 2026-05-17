import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '@/app/theme';
import { OfflineBanner } from './StateViews';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function Screen({
  title,
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  right,
  onBack,
  showBack,
}: {
  title: string;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  right?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const online = useOnlineStatus();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const canGoBack = showBack ?? (typeof navigation.canGoBack === 'function' ? navigation.canGoBack() : false);
  const handleBack = onBack ?? (() => navigation.goBack());

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {canGoBack ? (
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.navButton, pressed ? styles.navButtonPressed : null]} onPress={handleBack}>
              <Text style={styles.navButtonText}>‹</Text>
            </Pressable>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
      </View>
      <OfflineBanner visible={!online} />
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  headerSide: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 56,
  },
  headerRight: {
    justifyContent: 'flex-end',
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: typography.subtitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  navButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  navButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  navButtonText: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '400',
    lineHeight: 34,
  },
});
