import React, { useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { AvatarText } from '@/components/common/PageElements';
import { colors, spacing, typography } from '@/app/theme';
import { useGroupStore } from '@/stores/groupStore';
import { useSessionStore } from '@/stores/sessionStore';

export function GroupMembersScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const members = useGroupStore((state) => (session ? state.membersByGroup[session.targetId] || [] : []));
  const loadMembers = useGroupStore((state) => state.loadMembers);

  useEffect(() => {
    if (session?.type === 'group') {
      void loadMembers(session.targetId);
    }
  }, [loadMembers, session]);

  return (
    <Screen title="群成员" scroll={false}>
      {members.length === 0 ? <EmptyState title="暂无成员信息" /> : null}
      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const name = item.nickname || item.username || item.userId;
          return (
            <View style={styles.row}>
              <AvatarText label={name} />
              <View style={styles.body}>
                <Text numberOfLines={1} style={styles.name}>{name}</Text>
                <Text numberOfLines={1} style={styles.account}>账号：{item.username || item.userId}</Text>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  account: {
    color: colors.muted,
    fontSize: typography.small,
  },
});
