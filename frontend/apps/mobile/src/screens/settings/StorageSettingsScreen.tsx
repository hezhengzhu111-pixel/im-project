import React from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { kvStorage } from '@/services/storage/kvStorage';
import { messageRepository } from '@/services/storage/messageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';

export function StorageSettingsScreen() {
  return (
    <Screen title="Storage">
      <PrimaryButton
        label="Clear cache"
        onPress={() => {
          messageRepository.clearAllCache();
          uploadTaskRepository.clear();
          kvStorage.clearVolatileCache();
          Alert.alert('Cache cleared');
        }}
      />
    </Screen>
  );
}
