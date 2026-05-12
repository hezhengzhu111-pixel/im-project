import React from 'react';
import { Pressable, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';

const items = [
  ['Privacy', 'PrivacySettingsScreen'],
  ['Notifications', 'NotificationSettingsScreen'],
  ['Language', 'LanguageSettingsScreen'],
  ['Theme', 'ThemeSettingsScreen'],
  ['Storage', 'StorageSettingsScreen'],
  ['AI Assistant', 'AiSettingsScreen'],
  ['About', 'AboutScreen'],
] as const;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return (
    <Screen title="Settings">
      {items.map(([label, route]) => (
        <Pressable key={route} onPress={() => navigation.navigate(route)}>
          <Text>{label}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
