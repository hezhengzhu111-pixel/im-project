import React from 'react';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard, ListRow } from '@/components/common/PageElements';
import { useSettingsStore } from '@/stores/settingsStore';

export function ThemeSettingsScreen() {
  const setTheme = useSettingsStore((state) => state.setTheme);
  return (
    <Screen title="外观">
      <PageContent>
        <SectionCard title="外观模式" subtitle="暂不单独设计多套主题，默认跟随系统外观。">
          <ListRow title="跟随系统" subtitle="使用系统当前的显示偏好" value="当前" onPress={() => setTheme('system')} />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
