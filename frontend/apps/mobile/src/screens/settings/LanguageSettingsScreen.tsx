import React from 'react';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard, ListRow } from '@/components/common/PageElements';
import { useSettingsStore } from '@/stores/settingsStore';

export function LanguageSettingsScreen() {
  const setLocale = useSettingsStore((state) => state.setLocale);
  return (
    <Screen title="语言">
      <PageContent>
        <SectionCard title="显示语言" subtitle="移动端当前统一使用原生简体中文文案，后续可再接入系统语言切换。">
          <ListRow title="简体中文" subtitle="已启用" value="当前" onPress={() => setLocale('zh-CN')} />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
