import React from 'react';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard, InfoRow } from '@/components/common/PageElements';

export function AboutScreen() {
  return (
    <Screen title="关于">
      <PageContent>
        <SectionCard title="IM 聊天">
          <InfoRow label="客户端" value="移动端原生应用" />
          <InfoRow label="定位" value="安全、简洁、即时的聊天体验" />
          <InfoRow label="当前版本" value="0.0.1" />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
