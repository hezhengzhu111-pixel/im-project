import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { mediaService } from '@/services/media/mediaService';
import { useMomentsStore } from '@/stores/momentsStore';
import type { MobileFile } from '@/services/file/fileService';

export function CreateMomentScreen() {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<MobileFile[]>([]);
  const createPost = useMomentsStore((state) => state.createPost);
  return (
    <Screen title="Create Moment">
      <TextField label="Content" value={content} multiline onChangeText={setContent} />
      <PrimaryButton
        label={`Pick image (${files.length})`}
        onPress={() => {
          void mediaService.pickImage().then((file) => file && setFiles([...files, file]));
        }}
      />
      <PrimaryButton
        label="Publish"
        onPress={() => {
          void createPost(content, files).then(() => Alert.alert('Published'));
        }}
      />
    </Screen>
  );
}
