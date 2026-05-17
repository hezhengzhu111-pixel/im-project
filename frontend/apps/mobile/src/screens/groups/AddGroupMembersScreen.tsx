import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useGroupStore } from '@/stores/groupStore';
import { useSessionStore } from '@/stores/sessionStore';

export function AddGroupMembersScreen() {
  const [memberIds, setMemberIds] = useState('');
  const session = useSessionStore((state) => state.currentSession);
  const addMembers = useGroupStore((state) => state.addMembers);

  return (
    <Screen title="添加群成员">
      <PageContent>
        <SectionCard title="邀请成员" subtitle="多个成员标识请用英文逗号分隔">
          <TextField label="成员标识" value={memberIds} placeholder="例如：成员1,成员2" onChangeText={setMemberIds} />
          <PrimaryButton
            label="添加"
            disabled={session?.type !== 'group'}
            onPress={() => {
              void addMembers(session?.targetId || '', memberIds.split(',').map((item) => item.trim()).filter(Boolean)).then(() =>
                Alert.alert('成员已添加'),
              );
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
