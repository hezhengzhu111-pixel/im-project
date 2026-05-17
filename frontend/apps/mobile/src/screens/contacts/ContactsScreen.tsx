import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { EmptyState, LoadingState, OfflineBanner } from '@/components/common/StateViews';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useChatStore } from '@/stores/chatStore';
import { useContactStore } from '@/stores/contactStore';

const displayName = (item: { remark?: string; nickname?: string; username?: string; friendId: string }) =>
  item.remark || item.nickname || item.username || item.friendId;

export function ContactsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const online = useOnlineStatus();
  const friends = useContactStore((state) => state.friends);
  const requests = useContactStore((state) => state.friendRequests);
  const loading = useContactStore((state) => state.loading);
  const loadFriends = useContactStore((state) => state.loadFriends);
  const loadFriendRequests = useContactStore((state) => state.loadFriendRequests);
  const openPrivateSession = useChatStore((state) => state.openPrivateSession);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    void loadFriends();
    void loadFriendRequests();
  }, [loadFriends, loadFriendRequests]);

  const filteredFriends = useMemo(() => {
    const value = keyword.trim().toLowerCase();
    if (!value) return friends;
    return friends.filter((item) => displayName(item).toLowerCase().includes(value));
  }, [friends, keyword]);

  const refresh = () => {
    void loadFriends();
    void loadFriendRequests();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>通讯录</Text>
          <Pressable style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]} onPress={() => navigation.navigate('AddFriendScreen')}>
            <Text style={styles.headerButtonText}>＋</Text>
          </Pressable>
        </View>
        <OfflineBanner visible={!online} />

        <View style={styles.searchWrap}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="搜索联系人"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={keyword}
            onChangeText={setKeyword}
          />
        </View>

        <Pressable style={styles.requestRow} onPress={() => navigation.navigate('FriendRequestsScreen')}>
          <View style={styles.requestIcon}><Text style={styles.requestIconText}>新</Text></View>
          <Text style={styles.requestText}>新的朋友</Text>
          {requests.length > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{requests.length > 99 ? '99+' : requests.length}</Text></View> : null}
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        {loading && friends.length === 0 ? <LoadingState /> : null}
        {!loading && filteredFriends.length === 0 ? (
          <EmptyState title={keyword ? '没有匹配的联系人' : '暂无联系人'} subtitle="添加好友后即可开始聊天" />
        ) : null}

        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item.friendId}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const name = displayName(item);
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                onPress={() => {
                  void openPrivateSession({
                    targetId: item.friendId,
                    targetName: name,
                    targetAvatar: item.avatar,
                  }).then(() => navigation.navigate('ChatStack', { screen: 'ChatScreen' }));
                }}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.rowBody}>
                  <Text numberOfLines={1} style={styles.name}>{name}</Text>
                  <Text style={[styles.status, item.isOnline ? styles.online : null]}>{item.isOnline ? '在线' : '离线'}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.bg, flex: 1 },
  container: { backgroundColor: colors.bg, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 52, justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontSize: typography.subtitle, fontWeight: '800' },
  headerButton: { alignItems: 'center', borderRadius: radius.md, height: 36, justifyContent: 'center', width: 36 },
  headerButtonText: { color: colors.text, fontSize: 24, fontWeight: '700', lineHeight: 26 },
  pressed: { opacity: 0.65 },
  searchWrap: { padding: spacing.md },
  searchInput: { backgroundColor: colors.surface, borderRadius: radius.lg, color: colors.text, fontSize: typography.body, height: 42, paddingHorizontal: spacing.lg },
  requestRow: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.md, minHeight: 58, paddingHorizontal: spacing.lg },
  requestIcon: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  requestIconText: { color: '#FFFFFF', fontSize: typography.small, fontWeight: '900' },
  requestText: { color: colors.text, flex: 1, fontSize: typography.body, fontWeight: '700' },
  badge: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radius.pill, minWidth: 18, paddingHorizontal: 5 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', lineHeight: 16 },
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  row: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.lg },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  avatarText: { color: colors.primary, fontSize: typography.body, fontWeight: '900' },
  rowBody: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flex: 1, gap: spacing.xxs, justifyContent: 'center', minHeight: 64 },
  name: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  status: { color: colors.muted, fontSize: typography.small },
  online: { color: colors.primary },
  chevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
});
