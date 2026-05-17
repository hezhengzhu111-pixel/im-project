import React from 'react';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard, AvatarText, InfoRow } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useGroupStore } from '@/stores/groupStore';
import { useSessionStore } from '@/stores/sessionStore';

export function GroupProfileScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const leaveGroup = useGroupStore((state) => state.leaveGroup);

  return (
    <Screen title="群资料">
      <PageContent>
        <SectionCard>
          <AvatarText label={session?.targetName || '群'} square />
          <InfoRow label="群名称" value={session?.targetName || '未选择群组'} />
          <InfoRow label="成员数" value={`${session?.memberCount || 0} 位成员`} />
        </SectionCard>
        <SectionCard>
          <PrimaryButton
            disabled={session?.type !== 'group'}
            label="退出群组"
            variant="danger"
            onPress={() => {
              void leaveGroup(session?.targetId || '');
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}
