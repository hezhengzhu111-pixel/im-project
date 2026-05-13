import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { userService } from '@/services/user/userService';

export function ChangePasswordScreen() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  return (
    <Screen title="Change Password">
      <TextField label="Current password" value={oldPassword} secureTextEntry onChangeText={setOldPassword} />
      <TextField label="New password" value={newPassword} secureTextEntry onChangeText={setNewPassword} />
      <PrimaryButton
        label="Save"
        onPress={() => {
          void userService.changePassword({ oldPassword, newPassword }).then(() => Alert.alert('Password changed'));
        }}
      />
    </Screen>
  );
}
