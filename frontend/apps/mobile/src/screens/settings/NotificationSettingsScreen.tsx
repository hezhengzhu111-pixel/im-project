import React from 'react';
import { Switch, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { useSettingsStore } from '@/stores/settingsStore';

export function NotificationSettingsScreen() {
  const notificationEnabled = useSettingsStore((state) => state.notificationEnabled);
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const updateMessageSetting = useSettingsStore((state) => state.updateMessageSetting);
  return (
    <Screen title="Notifications">
      <View>
        <Text>Notifications</Text>
        <Switch
          value={notificationEnabled}
          onValueChange={(v) => {
            void updateMessageSetting('enableNotification', v);
          }}
        />
      </View>
      <View>
        <Text>Sound</Text>
        <Switch
          value={soundEnabled}
          onValueChange={(v) => {
            void updateMessageSetting('enableSound', v);
          }}
        />
      </View>
    </Screen>
  );
}
