import React, { useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { EmptyState, OfflineBanner } from '@/components/common/StateViews';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useChatStore } from '@/stores/chatStore';
import { useGroupStore } from '@/stores/groupStore';

const groupName = (item: { groupName?: string; name?: string; id: string }) => item.groupName || item.name || item.id;

export function GroupsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const online = useOnlineStatus();
  const groups = useGroupStore((state) => state.groups);
  const loadGroups = useGroupStore((state) => state.loadGroups);
  const openGroupSession = useChatStore((state) => state.openGroupSession);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>群组</Text>
          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]} onPress={() => navigation.navigate('JoinGroupScreen')}>
              <Text style={styles.headerButtonText}>入</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]} onPress={() => navigation.navigate('CreateGroupScreen')}>
              <Text style={styles.headerButtonText}>＋</Text>
            </Pressable>
          </View>
        </View>
        <OfflineBanner visible={!online} />

        {groups.length === 0 ? <EmptyState title="暂无群组" subtitle="创建或加入群组后即可群聊" /> : null}

        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void loadGroups()} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const name = groupName(item);
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                onPress={() => {
                  void openGroupSession(item).then(() => navigation.navigate('ChatStack', { screen: 'ChatScreen' }));
                }}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.rowBody}>
                  <Text numberOfLines={1} style={styles.name}>{name}</Text>
                  <Text style={styles.meta}>{item.memberCount || 0} 位成员</Text>
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
  actions: { flexDirection: 'row', gap: spacing.xs },
  headerButton: { alignItems: 'center', borderRadius: radius.md, height: 36, justifyContent: 'center', width: 36 },
  headerButtonText: { color: colors.text, fontSize: 22, fontWeight: '800', lineHeight: 24 },
  pressed: { opacity: 0.65 },
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  row: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.md, minHeight: 66, paddingHorizontal: spacing.lg },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  avatarText: { color: colors.primary, fontSize: typography.body, fontWeight: '900' },
  rowBody: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flex: 1, gap: spacing.xxs, justifyContent: 'center', minHeight: 66 },
  name: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: typography.small },
  chevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
});
