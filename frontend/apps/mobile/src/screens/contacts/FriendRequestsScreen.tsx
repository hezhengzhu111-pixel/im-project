import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { AvatarText } from '@/components/common/PageElements';
import { colors, spacing, typography } from '@/app/theme';
import { useContactStore } from '@/stores/contactStore';

export function FriendRequestsScreen() {
  const requests = useContactStore((state) => state.friendRequests);
  const loadFriendRequests = useContactStore((state) => state.loadFriendRequests);
  const acceptRequest = useContactStore((state) => state.acceptRequest);
  const rejectRequest = useContactStore((state) => state.rejectRequest);

  useEffect(() => {
    void loadFriendRequests();
  }, [loadFriendRequests]);

  return (
    <Screen title="好友申请" scroll={false} onRefresh={loadFriendRequests}>
      {requests.length === 0 ? <EmptyState title="暂无好友申请" /> : null}
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <AvatarText label={item.applicantNickname || item.applicantUsername || item.applicantId} />
            <View style={styles.body}>
              <Text numberOfLines={1} style={styles.name}>{item.applicantNickname || item.applicantUsername || item.applicantId}</Text>
              <Text numberOfLines={2} style={styles.reason}>{item.reason || '请求添加你为好友'}</Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={() => {
                    void acceptRequest(item.id);
                  }}
                >
                  <Text style={styles.acceptText}>同意</Text>
                </Pressable>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => {
                    void rejectRequest(item.id);
                  }}
                >
                  <Text style={styles.rejectText}>拒绝</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  body: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  reason: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: typography.small,
    fontWeight: '800',
  },
  rejectText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '700',
  },
});
