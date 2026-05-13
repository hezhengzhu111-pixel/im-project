import React, { useEffect } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { useContactStore } from '@/stores/contactStore';

export function FriendRequestsScreen() {
  const requests = useContactStore((state) => state.friendRequests);
  const loadFriendRequests = useContactStore((state) => state.loadFriendRequests);
  const acceptRequest = useContactStore((state) => state.acceptRequest);
  const rejectRequest = useContactStore((state) => state.rejectRequest);

  useEffect(() => {
    void loadFriendRequests();
  }, [loadFriendRequests]);

  return (
    <Screen title="Friend Requests" scroll={false} onRefresh={loadFriendRequests}>
      {requests.length === 0 ? <EmptyState title="No requests" /> : null}
      <FlatList
        data={requests}
        keyExtractor={(item) => item.requestId}
        renderItem={({ item }) => (
          <View>
            <Text>{item.nickname || item.username || item.fromUserId}</Text>
            <Text>{item.reason}</Text>
            <Pressable
              onPress={() => {
                void acceptRequest(item.requestId);
              }}
            >
              <Text>Accept</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void rejectRequest(item.requestId);
              }}
            >
              <Text>Reject</Text>
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}
