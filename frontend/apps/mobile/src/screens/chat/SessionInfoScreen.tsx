import React from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard, InfoRow } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { colors, spacing, typography } from '@/app/theme';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';

export function SessionInfoScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const updateSessionFlags = useSessionStore((state) => state.updateSessionFlags);
  const clearMessages = useMessageStore((state) => state.clearMessages);

  if (!session) {
    return <Screen title="会话详情"><PageContent><SectionCard><Text style={styles.emptyText}>暂无会话</Text></SectionCard></PageContent></Screen>;
  }

  return (
    <Screen title="会话详情">
      <PageContent>
        <SectionCard title={session.targetName || '未命名会话'}>
          <InfoRow label="会话标识" value={session.targetId} />
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>置顶聊天</Text>
              <Text style={styles.switchSubtitle}>置顶后会优先显示在会话列表</Text>
            </View>
            <Switch value={Boolean(session.isPinned)} onValueChange={() => updateSessionFlags(session.id, { isPinned: !session.isPinned })} />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>消息免打扰</Text>
              <Text style={styles.switchSubtitle}>开启后不再提醒此会话新消息</Text>
            </View>
            <Switch value={Boolean(session.isMuted)} onValueChange={() => updateSessionFlags(session.id, { isMuted: !session.isMuted })} />
          </View>
        </SectionCard>
        <SectionCard>
          <PrimaryButton
            label="清空聊天记录"
            variant="danger"
            onPress={() => {
              clearMessages(session.id);
              Alert.alert('已清空聊天记录');
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: 'center',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  switchTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  switchTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  switchSubtitle: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
  },
});
