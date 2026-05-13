import React from 'react';
import { Pressable, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useAuthStore } from '@/stores/authStore';

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const user = useAuthStore((state) => state.currentUser);
  const logout = useAuthStore((state) => state.logout);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  return (
    <Screen title="Profile">
      <Text>{user?.nickname || user?.username}</Text>
      <Text>{user?.email || 'Email not bound'}</Text>
      <Text>{user?.phone || 'Phone not bound'}</Text>
      <PrimaryButton label="Edit profile" onPress={() => navigation.navigate('EditProfileScreen')} />
      <PrimaryButton label="Change password" onPress={() => navigation.navigate('ChangePasswordScreen')} />
      <PrimaryButton label="Settings" onPress={() => navigation.navigate('SettingsScreen')} />
      {hasPermission('log:read') ? (
        <Pressable onPress={() => navigation.navigate('LogMonitorScreen')}><Text>Admin logs</Text></Pressable>
      ) : null}
      <PrimaryButton
        label="Logout"
        onPress={() => {
          void logout();
        }}
      />
    </Screen>
  );
}
