import React from 'react';
import { Switch, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { useSettingsStore } from '@/stores/settingsStore';

export function PrivacySettingsScreen() {
  const readReceiptEnabled = useSettingsStore((state) => state.readReceiptEnabled);
  const updatePrivacySetting = useSettingsStore((state) => state.updatePrivacySetting);
  return (
    <Screen title="Privacy">
      <View>
        <Text>Read receipts</Text>
        <Switch
          value={readReceiptEnabled}
          onValueChange={(v) => {
            void updatePrivacySetting('messageReadReceipt', v);
          }}
        />
      </View>
    </Screen>
  );
}
