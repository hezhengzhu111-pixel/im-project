import React, { useEffect } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useChatStore } from '@/stores/chatStore';
import { useContactStore } from '@/stores/contactStore';

export function ContactsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const friends = useContactStore((state) => state.friends);
  const loading = useContactStore((state) => state.loading);
  const loadFriends = useContactStore((state) => state.loadFriends);
  const openPrivateSession = useChatStore((state) => state.openPrivateSession);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  return (
    <Screen
      title="Contacts"
      scroll={false}
      right={<PrimaryButton label="Add" onPress={() => navigation.navigate('AddFriendScreen')} />}
      refreshing={loading}
      onRefresh={loadFriends}
    >
      {loading && friends.length === 0 ? <LoadingState /> : null}
      {!loading && friends.length === 0 ? <EmptyState title="No friends" /> : null}
      <FlatList
        data={friends}
        keyExtractor={(item) => item.friendId}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              void openPrivateSession({
                targetId: item.friendId,
                targetName: item.remark || item.nickname || item.username || item.friendId,
                targetAvatar: item.avatar,
              }).then(() => navigation.navigate('ChatStack', { screen: 'ChatScreen' }))
            }
          >
            <Text>{item.remark || item.nickname || item.username || item.friendId} {item.online ? 'online' : ''}</Text>
          </Pressable>
        )}
      />
      <PrimaryButton label="Friend requests" onPress={() => navigation.navigate('FriendRequestsScreen')} />
    </Screen>
  );
}
