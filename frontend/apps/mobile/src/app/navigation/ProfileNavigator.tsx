import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { EditProfileScreen } from '@/screens/profile/EditProfileScreen';
import { ChangePasswordScreen } from '@/screens/profile/ChangePasswordScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { PrivacySettingsScreen } from '@/screens/settings/PrivacySettingsScreen';
import { NotificationSettingsScreen } from '@/screens/settings/NotificationSettingsScreen';
import { LanguageSettingsScreen } from '@/screens/settings/LanguageSettingsScreen';
import { ThemeSettingsScreen } from '@/screens/settings/ThemeSettingsScreen';
import { StorageSettingsScreen } from '@/screens/settings/StorageSettingsScreen';
import { AiSettingsScreen } from '@/screens/settings/AiSettingsScreen';
import { AboutScreen } from '@/screens/settings/AboutScreen';
import { DebugDiagnosticsScreen } from '@/screens/settings/DebugDiagnosticsScreen';
import { LogMonitorScreen } from '@/screens/logs/LogMonitorScreen';

export type ProfileStackParamList = {
  ProfileScreen: undefined;
  EditProfileScreen: undefined;
  ChangePasswordScreen: undefined;
  SettingsScreen: undefined;
  PrivacySettingsScreen: undefined;
  NotificationSettingsScreen: undefined;
  LanguageSettingsScreen: undefined;
  ThemeSettingsScreen: undefined;
  StorageSettingsScreen: undefined;
  AiSettingsScreen: undefined;
  AboutScreen: undefined;
  DebugDiagnosticsScreen: undefined;
  LogMonitorScreen: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
      <Stack.Screen name="EditProfileScreen" component={EditProfileScreen} />
      <Stack.Screen name="ChangePasswordScreen" component={ChangePasswordScreen} />
      <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
      <Stack.Screen name="PrivacySettingsScreen" component={PrivacySettingsScreen} />
      <Stack.Screen name="NotificationSettingsScreen" component={NotificationSettingsScreen} />
      <Stack.Screen name="LanguageSettingsScreen" component={LanguageSettingsScreen} />
      <Stack.Screen name="ThemeSettingsScreen" component={ThemeSettingsScreen} />
      <Stack.Screen name="StorageSettingsScreen" component={StorageSettingsScreen} />
      <Stack.Screen name="AiSettingsScreen" component={AiSettingsScreen} />
      <Stack.Screen name="AboutScreen" component={AboutScreen} />
      <Stack.Screen name="DebugDiagnosticsScreen" component={DebugDiagnosticsScreen} />
      <Stack.Screen name="LogMonitorScreen" component={LogMonitorScreen} />
    </Stack.Navigator>
  );
}
