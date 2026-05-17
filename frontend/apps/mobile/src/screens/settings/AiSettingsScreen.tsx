import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { aiService } from '@/services/ai/aiService';
import { colors, spacing, typography } from '@/app/theme';
import type { AiApiKey, AiSettings } from '@im/shared-types';

const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'minimax', label: 'MiniMax' },
];

export function AiSettingsScreen() {
  const [keys, setKeys] = useState<AiApiKey[]>([]);
  const [settings, setSettings] = useState<AiSettings>({ autoReplyEnabled: false, autoReplyPersona: '' });
  const [provider, setProvider] = useState('deepseek');
  const [keyName, setKeyName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [keyResponse, settingsResponse] = await Promise.all([aiService.listKeys(), aiService.getSettings()]);
      setKeys(keyResponse.data);
      setSettings(settingsResponse.data);
    } catch {
      // 静默处理加载错误
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleAutoReply = useCallback(
    async (value: boolean) => {
      try {
        const response = await aiService.updateSettings({ autoReplyEnabled: value });
        setSettings(response.data);
      } catch {
        Alert.alert('错误', '更新自动回复设置失败');
      }
    },
    [],
  );

  const handleSavePersona = useCallback(async () => {
    try {
      setLoading(true);
      const response = await aiService.updateSettings(settings);
      setSettings(response.data);
      Alert.alert('成功', '助手人设已保存');
    } catch {
      Alert.alert('错误', '保存人设失败');
    } finally {
      setLoading(false);
    }
  }, [settings]);

  const handleCreateKey = useCallback(async () => {
    if (!apiKey.trim()) {
      Alert.alert('提示', '请输入接口密钥');
      return;
    }
    try {
      setLoading(true);
      await aiService.createKey({ provider, keyName: keyName || provider, apiKey: apiKey.trim() });
      setApiKey('');
      setKeyName('');
      await load();
      Alert.alert('成功', '接口密钥已添加');
    } catch {
      Alert.alert('错误', '添加接口密钥失败');
    } finally {
      setLoading(false);
    }
  }, [apiKey, keyName, provider, load]);

  const handleTestKey = useCallback(async (id: string) => {
    try {
      const response = await aiService.testKey(id);
      Alert.alert('测试结果', `状态: ${response.data.validateStatus}`);
    } catch {
      Alert.alert('错误', '测试接口密钥失败');
    }
  }, []);

  const handleDeleteKey = useCallback(
    async (id: string) => {
      Alert.alert('确认删除', '确定要删除这个接口密钥吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await aiService.deleteKey(id);
              await load();
            } catch {
              Alert.alert('错误', '删除接口密钥失败');
            }
          },
        },
      ]);
    },
    [load],
  );

  const renderKeyItem = useCallback(
    ({ item }: { item: AiApiKey }) => (
      <View style={styles.keyItem}>
        <View style={styles.keyInfo}>
          <Text style={styles.keyName}>{item.keyName || item.provider}</Text>
          <Text style={styles.keyMasked}>{item.maskedKey}</Text>
          <Text style={[styles.keyStatus, item.validateStatus === 'ok' ? styles.statusOk : styles.statusUnknown]}>
            {item.validateStatus === 'ok' ? '✓ 有效' : item.validateStatus || '未验证'}
          </Text>
        </View>
        <View style={styles.keyActions}>
          <Pressable style={styles.actionButton} onPress={() => { handleTestKey(item.id); }}>
            <Text style={styles.actionText}>测试</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={() => { handleDeleteKey(item.id); }}>
            <Text style={styles.deleteText}>删除</Text>
          </Pressable>
        </View>
      </View>
    ),
    [handleTestKey, handleDeleteKey],
  );

  return (
    <Screen title="智能助手">
      <View style={styles.container}>
        {/* 安全提示 */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>安全说明</Text>
          <Text style={styles.noticeText}>
            • 接口密钥通过加密传输存储于服务端，不会保存在本地{'\n'}
            • 当前功能为初版，完整安全策略待后续确认{'\n'}• 如有安全顾虑，请勿添加敏感密钥
          </Text>
        </View>

        {/* 自动回复设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>自动回复</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
          <Text style={styles.switchText}>启用智能自动回复</Text>
          <Text style={styles.switchHint}>收到消息时自动生成回复内容</Text>
            </View>
            <Switch
              value={settings.autoReplyEnabled}
              onValueChange={(value) => { handleToggleAutoReply(value); }}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <TextField
            label="助手人设"
            value={settings.autoReplyPersona}
            onChangeText={(value) => setSettings({ ...settings, autoReplyPersona: value })}
            placeholder="例如：你是一个友好的助手"
            multiline
          />
          <PrimaryButton label="保存人设" onPress={() => { handleSavePersona(); }} disabled={loading} />
        </View>

        {/* API Key 管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>接口密钥管理</Text>
          <Text style={styles.sectionHint}>
            添加服务提供商的接口密钥，用于自动回复功能。当前支持 DeepSeek、OpenAI、MiniMax。
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>选择提供商</Text>
            <View style={styles.providerRow}>
              {PROVIDER_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.providerChip, provider === opt.value && styles.providerChipActive]}
                  onPress={() => setProvider(opt.value)}
                >
                  <Text style={[styles.providerChipText, provider === opt.value && styles.providerChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <TextField label="密钥名称（可选）" value={keyName} onChangeText={setKeyName} placeholder="例如：我的 OpenAI 密钥" />
          <TextField
            label="接口密钥"
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-..."
            secureTextEntry
          />
          <PrimaryButton label="添加接口密钥" onPress={() => { handleCreateKey(); }} disabled={loading || !apiKey.trim()} />
        </View>

        {/* 已添加的 Key 列表 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>已添加的接口密钥</Text>
          {keys.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>暂无接口密钥</Text>
              <Text style={styles.emptyHint}>添加接口密钥后即可使用智能助手功能</Text>
            </View>
          ) : (
            <FlatList
              data={keys}
              keyExtractor={(item) => item.id}
              renderItem={renderKeyItem}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* 功能状态说明 */}
        <View style={styles.footerNotice}>
          <Text style={styles.footerText}>当前功能为初版，部分能力待后端接口和安全策略确认后开放。</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  noticeCard: {
    backgroundColor: colors.warning + '20',
    borderRadius: 8,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  noticeText: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  sectionHint: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  switchText: {
    color: colors.text,
    fontSize: typography.body,
  },
  switchHint: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: 2,
  },
  formGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  providerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  providerChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  providerChipText: {
    color: colors.text,
    fontSize: typography.small,
  },
  providerChipTextActive: {
    color: '#FFFFFF',
  },
  keyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  keyInfo: {
    flex: 1,
    gap: 2,
  },
  keyName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  keyMasked: {
    color: colors.muted,
    fontSize: typography.small,
  },
  keyStatus: {
    fontSize: typography.small,
  },
  statusOk: {
    color: colors.success,
  },
  statusUnknown: {
    color: colors.muted,
  },
  keyActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    backgroundColor: colors.primary + '20',
  },
  actionText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: colors.danger + '20',
  },
  deleteText: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyText: {
    color: colors.muted,
    fontSize: typography.body,
  },
  emptyHint: {
    color: colors.muted,
    fontSize: typography.small,
  },
  footerNotice: {
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: 8,
  },
  footerText: {
    color: colors.muted,
    fontSize: typography.small,
    textAlign: 'center',
    lineHeight: 18,
  },
});
