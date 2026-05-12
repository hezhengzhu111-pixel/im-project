import React, { useState } from 'react';
import { FlatList, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/forms/TextField';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';

export function ChatSearchScreen() {
  const [keyword, setKeyword] = useState('');
  const searchResults = useMessageStore((state) => state.searchResults);
  const searchMessages = useMessageStore((state) => state.searchMessages);
  const session = useSessionStore((state) => state.currentSession);

  return (
    <Screen title="Search Messages">
      <TextField
        label="Keyword"
        value={keyword}
        onChangeText={(value) => {
          setKeyword(value);
          searchMessages(value, session?.id);
        }}
      />
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.content || item.mediaName}</Text>}
      />
    </Screen>
  );
}
