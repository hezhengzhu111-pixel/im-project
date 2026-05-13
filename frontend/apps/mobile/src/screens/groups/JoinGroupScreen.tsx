import React, { useState } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useGroupStore } from '@/stores/groupStore';

export function JoinGroupScreen() {
  const [keyword, setKeyword] = useState('');
  const searchResults = useGroupStore((state) => state.searchResults);
  const searchGroups = useGroupStore((state) => state.searchGroups);
  const joinGroup = useGroupStore((state) => state.joinGroup);

  return (
    <Screen title="Join Group">
      <TextField label="Keyword" value={keyword} onChangeText={setKeyword} />
      <PrimaryButton
        label="Search"
        onPress={() => {
          void searchGroups(keyword);
        }}
      />
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              void joinGroup(item.id);
            }}
          >
            <Text>{item.groupName || item.name || item.id} - Join</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
