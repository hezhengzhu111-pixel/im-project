import { Linking } from 'react-native';
import { openSettings as openPermissionSettings } from 'react-native-permissions';

export const openSystemSettings = () =>
  openPermissionSettings().catch(() => Linking.openSettings());
