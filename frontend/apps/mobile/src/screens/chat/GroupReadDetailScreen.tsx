import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { colors, spacing, typography } from '@/app/theme';
import { useSessionStore } from '@/stores/sessionStore';

export function GroupReadDetailScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const readers: string[] = [];
  return (
    <Screen title="已读详情">
      <PageContent>
        {session?.type !== 'group' ? (
          <EmptyState title="私聊会话" subtitle="已读详情仅适用于群消息" />
        ) : (
          <SectionCard title="已读成员">
            {readers.length === 0 ? (
              <EmptyState title="暂无已读记录" />
            ) : (
              <FlatList
                data={readers}
                keyExtractor={(item) => item}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => <Text style={styles.reader}>{item}</Text>}
              />
            )}
          </SectionCard>
        )}
      </PageContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reader: {
    color: colors.text,
    fontSize: typography.body,
    paddingVertical: spacing.sm,
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
});
