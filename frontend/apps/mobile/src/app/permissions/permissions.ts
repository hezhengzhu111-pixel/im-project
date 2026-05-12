import { Alert, Linking, Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  type Permission,
  check,
  openSettings,
  request,
  requestNotifications,
} from 'react-native-permissions';

const explainDenied = (label: string) => {
  Alert.alert(`${label} permission required`, `Please enable ${label} permission in system settings.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open settings',
      onPress: () => {
        void openSettings().catch(() => Linking.openSettings());
      },
    },
  ]);
};

const ensurePermission = async (permission: Permission, label: string): Promise<boolean> => {
  const current = await check(permission);
  if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) {
    return true;
  }
  const next = await request(permission);
  const granted = next === RESULTS.GRANTED || next === RESULTS.LIMITED;
  if (!granted) {
    explainDenied(label);
  }
  return granted;
};

export const permissions = {
  camera: () =>
    Platform.OS === 'android'
      ? ensurePermission(PERMISSIONS.ANDROID.CAMERA, 'Camera')
      : ensurePermission(PERMISSIONS.IOS.CAMERA, 'Camera'),

  microphone: () =>
    Platform.OS === 'android'
      ? ensurePermission(PERMISSIONS.ANDROID.RECORD_AUDIO, 'Microphone')
      : ensurePermission(PERMISSIONS.IOS.MICROPHONE, 'Microphone'),

  media: () => {
    if (Platform.OS !== 'android') {
      return ensurePermission(PERMISSIONS.IOS.PHOTO_LIBRARY, 'Photo library');
    }
    if (Platform.Version >= 33) {
      return ensurePermission(PERMISSIONS.ANDROID.READ_MEDIA_IMAGES, 'Photos and media');
    }
    return ensurePermission(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE, 'File read');
  },

  notifications: async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      return ensurePermission('android.permission.POST_NOTIFICATIONS' as Permission, 'Notifications');
    }
    const result = await requestNotifications(['alert', 'badge', 'sound']);
    return result.status === RESULTS.GRANTED || result.status === RESULTS.LIMITED;
  },
};
