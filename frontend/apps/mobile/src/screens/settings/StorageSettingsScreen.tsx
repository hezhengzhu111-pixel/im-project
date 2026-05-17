import React from 'react';
import { Alert } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { kvStorage } from '@/services/storage/kvStorage';
import { messageRepository } from '@/services/storage/messageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';

export function StorageSettingsScreen() {
  return (
    <Screen title="存储空间">
      <PageContent>
        <SectionCard title="本地缓存" subtitle="清理本地消息缓存、上传任务和临时数据，不会退出当前账号。">
          <PrimaryButton
            label="清理缓存"
            onPress={() => {
              messageRepository.clearAllCache();
              uploadTaskRepository.clear();
              kvStorage.clearVolatileCache();
              Alert.alert('缓存已清理');
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
