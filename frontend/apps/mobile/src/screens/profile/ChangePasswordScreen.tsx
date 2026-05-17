import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { userService } from '@/services/user/userService';

export function ChangePasswordScreen() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  return (
    <Screen title="修改密码">
      <PageContent>
        <SectionCard title="账号安全">
          <TextField label="当前密码" value={oldPassword} placeholder="请输入当前密码" secureTextEntry onChangeText={setOldPassword} />
          <TextField label="新密码" value={newPassword} placeholder="请输入新密码" secureTextEntry onChangeText={setNewPassword} />
          <PrimaryButton
            label="保存"
            onPress={() => {
              void userService.changePassword({ oldPassword, newPassword }).then(() => Alert.alert('密码已修改'));
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
