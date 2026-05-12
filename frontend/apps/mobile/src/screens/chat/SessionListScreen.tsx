import React, { useEffect } from 'react';
import { FlatList } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import { SessionRow } from '@/components/chat/SessionRow';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';

export function SessionListScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const sessions = useSessionStore((state) => state.sessions);
  const loading = useChatStore((state) => state.loading);
  const bootstrap = useChatStore((state) => state.bootstrap);
  const openSession = useChatStore((state) => state.openSession);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Screen title="Chats" scroll={false} refreshing={loading} onRefresh={bootstrap}>
      {loading && sessions.length === 0 ? <LoadingState /> : null}
      {!loading && sessions.length === 0 ? <EmptyState title="No conversations" subtitle="Start from Contacts or Groups." /> : null}
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onPress={() => {
              void openSession(item).then(() => navigation.navigate('ChatScreen'));
            }}
          />
        )}
      />
    </Screen>
  );
}
