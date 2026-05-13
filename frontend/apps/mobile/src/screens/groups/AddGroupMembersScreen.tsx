import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useGroupStore } from '@/stores/groupStore';
import { useSessionStore } from '@/stores/sessionStore';

export function AddGroupMembersScreen() {
  const [memberIds, setMemberIds] = useState('');
  const session = useSessionStore((state) => state.currentSession);
  const addMembers = useGroupStore((state) => state.addMembers);

  return (
    <Screen title="Add Members">
      <TextField label="Member IDs, comma separated" value={memberIds} onChangeText={setMemberIds} />
      <PrimaryButton
        label="Add"
        disabled={session?.type !== 'group'}
        onPress={() => {
          void addMembers(session?.targetId || '', memberIds.split(',').map((item) => item.trim()).filter(Boolean)).then(() =>
            Alert.alert('Members added'),
          );
        }}
      />
    </Screen>
  );
}
