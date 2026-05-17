import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { EmptyState, LoadingState, OfflineBanner } from '@/components/common/StateViews';
import { SessionRow } from '@/components/chat/SessionRow';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useWebsocketStore } from '@/stores/websocketStore';

export function SessionListScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const online = useOnlineStatus();
  const currentUser = useAuthStore((state) => state.currentUser);
  const sessions = useSessionStore((state) => state.sessions);
  const loading = useChatStore((state) => state.loading);
  const bootstrap = useChatStore((state) => state.bootstrap);
  const refreshSessions = useChatStore((state) => state.refreshSessions);
  const openSession = useChatStore((state) => state.openSession);
  const isUserOnline = useWebsocketStore((state) => state.isUserOnline);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();
  const filteredSessions = useMemo(() => {
    if (!normalizedSearchKeyword) return sessions;
    return sessions.filter((session) => {
      const preview = session.lastMessage?.content || session.lastMessage?.mediaName || '';
      return [session.targetName, session.conversationName, session.targetId, preview]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchKeyword);
    });
  }, [normalizedSearchKeyword, sessions]);

  const totalUnreadCount = useMemo(
    () => sessions.reduce((total, session) => total + Math.max(0, session.unreadCount || 0), 0),
    [sessions],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSessions();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSessions]);

  const handleOpenCreateGroup = useCallback(() => {
    navigation.navigate('GroupsStack', { screen: 'CreateGroupScreen' });
  }, [navigation]);

  const userName = currentUser?.nickname || currentUser?.username || '我';
  const userAvatarText = userName.slice(0, 1).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.userAvatar}>
              {currentUser?.avatar ? (
                <Image source={{ uri: currentUser.avatar }} style={styles.userAvatarImage} />
              ) : (
                <Text style={styles.userAvatarText}>{userAvatarText}</Text>
              )}
            </View>
            <View>
              <Text style={styles.headerTitle}>消息</Text>
              <Text style={styles.headerSubtitle}>
                {sessions.length} 个会话 · {totalUnreadCount} 条未读
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="搜索会话"
              style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
              onPress={() => setSearchOpen((value) => !value)}
            >
              <Text style={styles.iconButtonText}>⌕</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="创建群组"
              style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
              onPress={handleOpenCreateGroup}
            >
              <Text style={styles.iconButtonText}>＋</Text>
            </Pressable>
          </View>
        </View>

        <OfflineBanner visible={!online} />

        {searchOpen ? (
          <View style={styles.searchWrap}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              clearButtonMode="while-editing"
              placeholder="搜索会话"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              value={searchKeyword}
              onChangeText={setSearchKeyword}
            />
          </View>
        ) : null}

        {loading && sessions.length === 0 ? (
          <LoadingState label="正在加载会话..." />
        ) : (
          <FlatList
            data={filteredSessions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.listContent,
              filteredSessions.length === 0 ? styles.emptyListContent : null,
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
            renderItem={({ item }) => (
              <SessionRow
                session={item}
                online={item.type === 'private' && isUserOnline(String(item.targetId || ''))}
                onPress={() => {
                  void openSession(item).then(() => navigation.navigate('ChatScreen'));
                }}
              />
            )}
            ListEmptyComponent={
              normalizedSearchKeyword ? (
                <EmptyState title="没有匹配的会话" subtitle="换个关键词试试" />
              ) : (
                <EmptyState
                  title="暂无会话"
                  subtitle="从通讯录发起聊天，或创建一个群组"
                  actionLabel="创建群组"
                  onAction={handleOpenCreateGroup}
                />
              )
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  container: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  userAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 32,
  },
  userAvatarImage: {
    height: 32,
    width: 32,
  },
  userAvatarText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '900',
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  iconButtonText: {
    color: colors.muted,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  searchWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
