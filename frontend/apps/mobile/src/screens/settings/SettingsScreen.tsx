import React from 'react';
import { Pressable, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { isDebugDiagnosticsEnabled } from '@/services/debug/debugDiagnosticsService';

const baseItems = [
  ['Privacy', 'PrivacySettingsScreen'],
  ['Notifications', 'NotificationSettingsScreen'],
  ['Language', 'LanguageSettingsScreen'],
  ['Theme', 'ThemeSettingsScreen'],
  ['Storage', 'StorageSettingsScreen'],
  ['AI Assistant', 'AiSettingsScreen'],
  ['About', 'AboutScreen'],
] as const;

export const getSettingsItems = (debugEnabled = isDebugDiagnosticsEnabled()) =>
  debugEnabled
    ? [...baseItems, ['Debug Diagnostics', 'DebugDiagnosticsScreen']] as const
    : baseItems;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return (
    <Screen title="Settings">
      {getSettingsItems().map(([label, route]) => (
        <Pressable key={route} onPress={() => navigation.navigate(route)}>
          <Text>{label}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
