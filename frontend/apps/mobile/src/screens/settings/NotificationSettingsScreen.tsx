import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { colors, spacing, typography } from '@/app/theme';
import { useSettingsStore } from '@/stores/settingsStore';

export function NotificationSettingsScreen() {
  const notificationEnabled = useSettingsStore((state) => state.notificationEnabled);
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const updateMessageSetting = useSettingsStore((state) => state.updateMessageSetting);
  return (
    <Screen title="通知">
      <PageContent>
        <SectionCard title="消息提醒">
          <View style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.label}>接收通知</Text>
              <Text style={styles.description}>开启后，新消息会触发系统通知</Text>
            </View>
            <Switch
              value={notificationEnabled}
              onValueChange={(v) => {
                void updateMessageSetting('enableNotification', v);
              }}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.label}>提示音</Text>
              <Text style={styles.description}>收到消息时播放系统提示音</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={(v) => {
                void updateMessageSetting('enableSound', v);
              }}
            />
          </View>
        </SectionCard>
      </PageContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  labelWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  description: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
  },
});
