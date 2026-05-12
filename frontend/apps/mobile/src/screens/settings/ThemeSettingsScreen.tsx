import React from 'react';
import { Pressable, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { useSettingsStore } from '@/stores/settingsStore';

export function ThemeSettingsScreen() {
  const setTheme = useSettingsStore((state) => state.setTheme);
  return (
    <Screen title="Theme">
      <Pressable onPress={() => setTheme('light')}><Text>Light</Text></Pressable>
      <Pressable onPress={() => setTheme('dark')}><Text>Dark</Text></Pressable>
      <Pressable onPress={() => setTheme('system')}><Text>System</Text></Pressable>
    </Screen>
  );
}
