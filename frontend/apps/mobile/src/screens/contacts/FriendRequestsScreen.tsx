import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { AvatarText } from '@/components/common/PageElements';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useContactStore } from '@/stores/contactStore';

export function FriendRequestsScreen() {
  const allRequests = useContactStore((state) => state.friendRequests);
  const loadFriendRequests = useContactStore((state) => state.loadFriendRequests);
  const acceptRequest = useContactStore((state) => state.acceptRequest);
  const rejectRequest = useContactStore((state) => state.rejectRequest);
  const [handlingIds, setHandlingIds] = useState<Record<string, boolean>>({});

  const requests = useMemo(
    () => allRequests.filter((request) => request.status === 'PENDING'),
    [allRequests],
  );

  useEffect(() => {
    void loadFriendRequests();
  }, [loadFriendRequests]);

  const handleRequest = async (id: string, action: 'accept' | 'reject') => {
    if (handlingIds[id]) return;
    setHandlingIds((value) => ({ ...value, [id]: true }));
    try {
      if (action === 'accept') {
        await acceptRequest(id);
      } else {
        await rejectRequest(id);
      }
    } catch (error) {
      Alert.alert(action === 'accept' ? '同意失败' : '拒绝失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setHandlingIds((value) => {
        const next = { ...value };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <Screen title="好友申请" scroll={false} onRefresh={loadFriendRequests}>
      {requests.length === 0 ? <EmptyState title="暂无好友申请" /> : null}
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const name = item.applicantNickname || item.applicantUsername || item.applicantId;
          const handling = Boolean(handlingIds[item.id]);
          return (
            <View style={styles.card}>
              <AvatarText label={name} />
              <View style={styles.body}>
                <Text numberOfLines={1} style={styles.name}>{name}</Text>
                <Text numberOfLines={2} style={styles.reason}>{item.reason || '请求添加你为好友'}</Text>
                <View style={styles.actions}>
                  <Pressable
                    disabled={handling}
                    style={({ pressed }) => [styles.actionButton, styles.acceptButton, pressed && !handling ? styles.pressed : null, handling ? styles.disabled : null]}
                    onPress={() => { void handleRequest(item.id, 'accept'); }}
                  >
                    <Text style={styles.acceptText}>{handling ? '处理中' : '同意'}</Text>
                  </Pressable>
                  <Pressable
                    disabled={handling}
                    style={({ pressed }) => [styles.actionButton, pressed && !handling ? styles.pressed : null, handling ? styles.disabled : null]}
                    onPress={() => { void handleRequest(item.id, 'reject'); }}
                  >
                    <Text style={styles.rejectText}>拒绝</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
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
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
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
