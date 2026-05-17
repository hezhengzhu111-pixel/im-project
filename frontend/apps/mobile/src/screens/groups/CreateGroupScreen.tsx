import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useGroupStore } from '@/stores/groupStore';

export function CreateGroupScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState('');
  const createGroup = useGroupStore((state) => state.createGroup);

  return (
    <Screen title="创建群组">
      <PageContent>
        <SectionCard title="群组信息" subtitle="成员标识可用英文逗号分隔，创建后可继续邀请成员">
          <TextField label="群名称" value={name} placeholder="请输入群名称" onChangeText={setName} />
          <TextField label="群介绍" value={description} placeholder="简单介绍这个群" onChangeText={setDescription} />
          <TextField label="成员标识" value={memberIds} placeholder="例如：成员1,成员2" onChangeText={setMemberIds} />
          <PrimaryButton
            label="创建"
            onPress={() => {
              void createGroup({
                name,
                description,
                memberIds: memberIds.split(',').map((item) => item.trim()).filter(Boolean),
              }).then(() => Alert.alert('群组已创建'));
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
