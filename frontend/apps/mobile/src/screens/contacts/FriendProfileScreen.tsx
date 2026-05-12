import React from 'react';
import { Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useChatStore } from '@/stores/chatStore';
import { useContactStore } from '@/stores/contactStore';

export function FriendProfileScreen() {
  const friend = useContactStore((state) => state.friends[0]);
  const deleteFriend = useContactStore((state) => state.deleteFriend);
  const openPrivateSession = useChatStore((state) => state.openPrivateSession);

  if (!friend) {
    return <Screen title="Friend"><Text>No friend selected</Text></Screen>;
  }

  return (
    <Screen title="Friend">
      <Text>{friend.nickname || friend.username || friend.friendId}</Text>
      <Text>{friend.remark}</Text>
      <PrimaryButton
        label="Message"
        onPress={() =>
          void openPrivateSession({
            targetId: friend.friendId,
            targetName: friend.remark || friend.nickname || friend.username || friend.friendId,
            targetAvatar: friend.avatar,
          })
        }
      />
      <PrimaryButton label="Delete friend" onPress={() => void deleteFriend(friend.friendId)} />
    </Screen>
  );
}
