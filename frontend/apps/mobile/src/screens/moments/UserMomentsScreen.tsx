import React from 'react';
import { FlatList, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { useMomentsStore } from '@/stores/momentsStore';

export function UserMomentsScreen() {
  const feed = useMomentsStore((state) => state.feed);
  return (
    <Screen title="User Moments" scroll={false}>
      <FlatList data={feed} keyExtractor={(item) => item.post.id} renderItem={({ item }) => <Text>{item.post.content}</Text>} />
    </Screen>
  );
}
