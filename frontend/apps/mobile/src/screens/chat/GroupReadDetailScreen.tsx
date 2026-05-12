import React from 'react';
import { FlatList, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { useSessionStore } from '@/stores/sessionStore';

export function GroupReadDetailScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const readers: string[] = [];
  return (
    <Screen title="Read Details">
      {session?.type !== 'group' ? <EmptyState title="Private chat" subtitle="Read details only apply to group messages." /> : null}
      <FlatList data={readers} renderItem={({ item }) => <Text>{item}</Text>} />
    </Screen>
  );
}
