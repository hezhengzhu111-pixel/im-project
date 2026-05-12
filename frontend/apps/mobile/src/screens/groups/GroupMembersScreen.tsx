import React, { useEffect } from 'react';
import { FlatList, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
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
    <Screen title="Group Members" scroll={false}>
      {members.length === 0 ? <EmptyState title="No members loaded" /> : null}
      <FlatList data={members} keyExtractor={(item) => item.userId} renderItem={({ item }) => <Text>{item.nickname || item.username || item.userId}</Text>} />
    </Screen>
  );
}
