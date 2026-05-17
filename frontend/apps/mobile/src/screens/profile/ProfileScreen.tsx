import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useAuthStore } from '@/stores/authStore';

function MenuRow({ label, value, danger, onPress }: { label: string; value?: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, pressed ? styles.pressed : null]} onPress={onPress}>
      <Text style={[styles.menuLabel, danger ? styles.dangerText : null]}>{label}</Text>
      <View style={styles.menuRight}>
        {value ? <Text numberOfLines={1} style={styles.menuValue}>{value}</Text> : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const user = useAuthStore((state) => state.currentUser);
  const logout = useAuthStore((state) => state.logout);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const name = user?.nickname || user?.username || '未设置昵称';

  const confirmLogout = () => {
    Alert.alert('退出登录', '确认退出当前账号？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <Screen title="我" scroll={false}>
      <View style={styles.container}>
        <Pressable style={({ pressed }) => [styles.profileCard, pressed ? styles.pressed : null]} onPress={() => navigation.navigate('EditProfileScreen')}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.profileBody}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <Text numberOfLines={1} style={styles.account}>账号：{user?.username || user?.id || '-'}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.group}>
          <MenuRow label="编辑资料" value={user?.email || '未绑定邮箱'} onPress={() => navigation.navigate('EditProfileScreen')} />
          <MenuRow label="修改密码" onPress={() => navigation.navigate('ChangePasswordScreen')} />
        </View>

        <View style={styles.group}>
          <MenuRow label="设置" onPress={() => navigation.navigate('SettingsScreen')} />
          {hasPermission('log:read') ? <MenuRow label="管理日志" onPress={() => navigation.navigate('LogMonitorScreen')} /> : null}
        </View>

        <View style={styles.group}>
          <MenuRow label="退出登录" danger onPress={confirmLogout} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.md },
  pressed: { opacity: 0.65 },
  profileCard: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.md, minHeight: 92, paddingHorizontal: spacing.lg },
  avatar: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, height: 58, justifyContent: 'center', width: 58 },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  profileBody: { flex: 1, gap: spacing.xs, minWidth: 0 },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  account: { color: colors.muted, fontSize: typography.small },
  group: { backgroundColor: colors.surface, marginTop: spacing.md },
  menuRow: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: spacing.lg },
  menuLabel: { color: colors.text, flex: 1, fontSize: typography.body, fontWeight: '600' },
  menuRight: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, maxWidth: '58%' },
  menuValue: { color: colors.muted, flexShrink: 1, fontSize: typography.small },
  chevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
  dangerText: { color: colors.danger },
});
