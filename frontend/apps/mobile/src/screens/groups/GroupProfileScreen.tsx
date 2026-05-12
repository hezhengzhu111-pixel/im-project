import React from 'react';
import { Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useGroupStore } from '@/stores/groupStore';
import { useSessionStore } from '@/stores/sessionStore';

export function GroupProfileScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const leaveGroup = useGroupStore((state) => state.leaveGroup);

  return (
    <Screen title="Group Profile">
      <Text>{session?.targetName || 'No group selected'}</Text>
      <Text>{session?.memberCount || 0} members</Text>
      <PrimaryButton disabled={session?.type !== 'group'} label="Leave group" onPress={() => void leaveGroup(session?.targetId || '')} />
    </Screen>
  );
}
