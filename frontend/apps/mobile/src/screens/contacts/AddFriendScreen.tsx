import React, { useState } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useContactStore } from '@/stores/contactStore';

export function AddFriendScreen() {
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const results = useContactStore((state) => state.searchResults);
  const searchUsers = useContactStore((state) => state.searchUsers);
  const addFriend = useContactStore((state) => state.addFriend);

  return (
    <Screen title="Add Friend">
      <TextField label="Keyword" value={keyword} onChangeText={setKeyword} />
      <TextField label="Message" value={message} onChangeText={setMessage} />
      <PrimaryButton
        label="Search"
        onPress={() => {
          void searchUsers(keyword);
        }}
      />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              void addFriend(item.id, message);
            }}
          >
            <Text>{item.nickname || item.username || item.id} - Add</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
