import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { ErrorState } from '@/components/common/StateViews';
import { useSettingsStore } from '@/stores/settingsStore';
import { getMobileE2eeCapability } from '@/e2ee/e2eeCapability';
import { colors, spacing, typography } from '@/app/theme';

const e2eeCapability = getMobileE2eeCapability();

export function PrivacySettingsScreen() {
  const readReceiptEnabled = useSettingsStore((state) => state.readReceiptEnabled);
  const storeLoading = useSettingsStore((state) => state.loading);
  const updatePrivacySetting = useSettingsStore((state) => state.updatePrivacySetting);

  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = storeLoading || updating;

  const handleToggleReadReceipt = useCallback(
    async (value: boolean) => {
      if (loading) return;
      setError(null);
      setUpdating(true);
      try {
        await updatePrivacySetting('messageReadReceipt', value);
      } catch {
        setError('设置更新失败，请重试');
        Alert.alert('操作失败', '隐私设置更新失败，请检查网络后重试。');
      } finally {
        setUpdating(false);
      }
    },
    [loading, updatePrivacySetting],
  );

  return (
    <Screen title="隐私设置">
      {error ? (
        <ErrorState
          title="更新失败"
          message={error}
          retryLabel="重试"
          onRetry={() => setError(null)}
        />
      ) : null}
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.labelWrap}>
            <Text style={styles.label}>已读回执</Text>
            <Text style={styles.description}>开启后，对方可以看到你是否已读消息</Text>
          </View>
          <Switch
            value={readReceiptEnabled}
            disabled={loading}
            onValueChange={(v) => { handleToggleReadReceipt(v); }}
          />
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.labelWrap}>
            <Text style={styles.label}>端到端加密</Text>
            <Text style={styles.description}>{e2eeCapability.reason}</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.md,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  labelWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  description: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: 2,
  },
});
