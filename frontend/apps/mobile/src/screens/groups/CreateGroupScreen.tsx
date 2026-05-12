import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useGroupStore } from '@/stores/groupStore';

export function CreateGroupScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState('');
  const createGroup = useGroupStore((state) => state.createGroup);

  return (
    <Screen title="Create Group">
      <TextField label="Name" value={name} onChangeText={setName} />
      <TextField label="Description" value={description} onChangeText={setDescription} />
      <TextField label="Member IDs, comma separated" value={memberIds} onChangeText={setMemberIds} />
      <PrimaryButton
        label="Create"
        onPress={() =>
          void createGroup({
            name,
            description,
            memberIds: memberIds.split(',').map((item) => item.trim()).filter(Boolean),
          }).then(() => Alert.alert('Group created'))
        }
      />
    </Screen>
  );
}
