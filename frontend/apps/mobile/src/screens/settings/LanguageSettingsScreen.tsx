import React from 'react';
import { Pressable, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { useSettingsStore } from '@/stores/settingsStore';

export function LanguageSettingsScreen() {
  const setLocale = useSettingsStore((state) => state.setLocale);
  return (
    <Screen title="Language">
      <Pressable onPress={() => setLocale('zh-CN')}><Text>中文</Text></Pressable>
      <Pressable onPress={() => setLocale('en-US')}><Text>English</Text></Pressable>
    </Screen>
  );
}
