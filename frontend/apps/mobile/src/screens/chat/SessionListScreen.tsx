import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { EmptyState, LoadingState, OfflineBanner } from '@/components/common/StateViews';
import { SessionRow } from '@/components/chat/SessionRow';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useWebsocketStore } from '@/stores/websocketStore';

export function SessionListScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const online = useOnlineStatus();
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>聊天</Text>
          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]} onPress={() => setSearchOpen((value) => !value)}>
              <Text style={styles.headerButtonText}>⌕</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]} onPress={handleOpenCreateGroup}>
              <Text style={styles.headerButtonText}>＋</Text>
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
              placeholder="搜索聊天"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              value={searchKeyword}
              onChangeText={setSearchKeyword}
            />
          </View>
        ) : null}

        {loading && sessions.length === 0 ? (
          <LoadingState label="正在加载聊天..." />
        ) : (
          <FlatList
            data={filteredSessions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={filteredSessions.length === 0 ? styles.emptyListContent : styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
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
                <EmptyState title="没有匹配的聊天" subtitle="换个关键词试试" />
              ) : (
                <EmptyState title="暂无聊天" subtitle="从通讯录或群组开始聊天" actionLabel="创建群组" onAction={handleOpenCreateGroup} />
              )
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.bg, flex: 1 },
  container: { backgroundColor: colors.bg, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 52, justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontSize: typography.subtitle, fontWeight: '800' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  headerButton: { alignItems: 'center', borderRadius: radius.md, height: 36, justifyContent: 'center', width: 36 },
  headerButtonText: { color: colors.text, fontSize: 23, fontWeight: '700', lineHeight: 25 },
  pressed: { opacity: 0.65 },
  searchWrap: { padding: spacing.md },
  searchInput: { backgroundColor: colors.surface, borderRadius: radius.lg, color: colors.text, fontSize: typography.body, height: 42, paddingHorizontal: spacing.lg },
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
});
