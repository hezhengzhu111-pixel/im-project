import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PageContent, SectionCard, AvatarText, InfoRow } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { colors, spacing, typography } from '@/app/theme';
import { useChatStore } from '@/stores/chatStore';
import { useContactStore } from '@/stores/contactStore';

export function FriendProfileScreen() {
  const friend = useContactStore((state) => state.friends[0]);
  const deleteFriend = useContactStore((state) => state.deleteFriend);
  const openPrivateSession = useChatStore((state) => state.openPrivateSession);

  if (!friend) {
    return (
      <Screen title="好友资料">
        <PageContent>
          <SectionCard>
            <Text style={styles.emptyText}>请选择一个好友</Text>
          </SectionCard>
        </PageContent>
      </Screen>
    );
  }

  const name = friend.remark || friend.nickname || friend.username || friend.friendId;

  return (
    <Screen title="好友资料">
      <PageContent>
        <SectionCard>
          <View style={styles.profileHeader}>
            <AvatarText label={name} />
            <View style={styles.profileBody}>
              <Text numberOfLines={1} style={styles.name}>{name}</Text>
              <Text numberOfLines={1} style={styles.account}>账号：{friend.username || friend.friendId}</Text>
            </View>
          </View>
          <InfoRow label="备注" value={friend.remark || '未设置'} />
        </SectionCard>
        <SectionCard>
          <PrimaryButton
            label="发消息"
            onPress={() => {
              void openPrivateSession({
                targetId: friend.friendId,
                targetName: name,
                targetAvatar: friend.avatar,
              });
            }}
          />
          <PrimaryButton
            label="删除好友"
            variant="danger"
            onPress={() => {
              void deleteFriend(friend.friendId);
            }}
          />
        </SectionCard>
      </PageContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  profileBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  account: {
    color: colors.muted,
    fontSize: typography.small,
  },
});
