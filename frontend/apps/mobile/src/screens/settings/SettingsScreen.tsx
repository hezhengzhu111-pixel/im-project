import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { colors, spacing, typography } from '@/app/theme';
import { isDebugDiagnosticsEnabled } from '@/services/debug/debugDiagnosticsService';

const baseItems = [
  ['隐私', 'PrivacySettingsScreen'],
  ['通知', 'NotificationSettingsScreen'],
  ['语言', 'LanguageSettingsScreen'],
  ['外观', 'ThemeSettingsScreen'],
  ['存储空间', 'StorageSettingsScreen'],
  ['智能助手', 'AiSettingsScreen'],
  ['关于', 'AboutScreen'],
] as const;

export const getSettingsItems = (debugEnabled = isDebugDiagnosticsEnabled()) =>
  debugEnabled
    ? [...baseItems, ['调试诊断', 'DebugDiagnosticsScreen']] as const
    : baseItems;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return (
    <Screen title="设置" scroll={false}>
      <View style={styles.container}>
        <View style={styles.group}>
          {getSettingsItems().map(([label, route], index, arr) => (
            <Pressable
              key={route}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              onPress={() => navigation.navigate(route)}
            >
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.chevron}>›</Text>
              {index < arr.length - 1 ? <View style={styles.separator} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.md },
  group: { backgroundColor: colors.surface },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: spacing.lg, position: 'relative' },
  pressed: { opacity: 0.65 },
  label: { color: colors.text, flex: 1, fontSize: typography.body, fontWeight: '600' },
  chevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
  separator: { backgroundColor: colors.border, bottom: 0, height: StyleSheet.hairlineWidth, left: spacing.lg, position: 'absolute', right: 0 },
});
