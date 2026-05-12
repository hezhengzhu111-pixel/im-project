import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { mediaService } from '@/services/media/mediaService';
import { uploadService } from '@/services/upload/uploadService';
import { useAuthStore } from '@/stores/authStore';
import { useUserStore } from '@/stores/userStore';

export function EditProfileScreen() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const updateProfile = useUserStore((state) => state.updateProfile);
  const [nickname, setNickname] = useState(currentUser?.nickname || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [signature, setSignature] = useState(currentUser?.signature || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');

  const pickAvatar = async () => {
    const file = await mediaService.pickImage();
    if (file) {
      const uploaded = await uploadService.uploadFile(file, 'IMAGE');
      setAvatar(uploaded.url);
    }
  };

  return (
    <Screen title="Edit Profile">
      <TextField label="Nickname" value={nickname} onChangeText={setNickname} />
      <TextField label="Email" value={email} onChangeText={setEmail} />
      <TextField label="Phone" value={phone} onChangeText={setPhone} />
      <TextField label="Signature" value={signature} onChangeText={setSignature} />
      <PrimaryButton label="Upload avatar" onPress={() => void pickAvatar()} />
      <PrimaryButton
        label="Save"
        onPress={() =>
          void updateProfile({ nickname, email, phone, signature, avatar }).then(() => Alert.alert('Saved'))
        }
      />
    </Screen>
  );
}
