import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { spacing } from '@/app/theme';
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
    <Screen title="编辑资料">
      <View style={styles.container}>
        <View style={styles.form}>
          <TextField label="昵称" value={nickname} placeholder="请输入昵称" onChangeText={setNickname} />
          <TextField label="邮箱" value={email} placeholder="请输入邮箱" onChangeText={setEmail} />
          <TextField label="手机号" value={phone} placeholder="请输入手机号" onChangeText={setPhone} />
          <TextField label="个性签名" value={signature} placeholder="写点什么介绍自己" onChangeText={setSignature} />
        </View>
        <View style={styles.actions}>
          <PrimaryButton
            label="上传头像"
            variant="secondary"
            onPress={() => {
              void pickAvatar();
            }}
          />
          <PrimaryButton
            label="保存"
            onPress={() => {
              void updateProfile({ nickname, email, phone, signature, avatar }).then(() => Alert.alert('保存成功'));
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  actions: {
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
});
