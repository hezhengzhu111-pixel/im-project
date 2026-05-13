import { Alert, Linking, Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  type Permission,
  check,
  checkMultiple,
  openSettings,
  request,
  requestMultiple,
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

const ensurePermissions = async (requested: Permission[], label: string): Promise<boolean> => {
  const unique = Array.from(new Set(requested));
  const current = await checkMultiple(unique);
  const missing = unique.filter((permission) => {
    const status = current[permission];
    return status !== RESULTS.GRANTED && status !== RESULTS.LIMITED;
  });
  if (missing.length === 0) {
    return true;
  }
  const next = await requestMultiple(missing);
  const granted = unique.every((permission) => {
    const status = next[permission] || current[permission];
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  });
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

  media: (scope: 'images' | 'videos' | 'audio' | 'mixed' = 'images') => {
    if (Platform.OS !== 'android') {
      return ensurePermission(PERMISSIONS.IOS.PHOTO_LIBRARY, 'Photo library');
    }
    if (Platform.Version >= 33) {
      const requested =
        scope === 'videos'
          ? [PERMISSIONS.ANDROID.READ_MEDIA_VIDEO]
          : scope === 'audio'
            ? [PERMISSIONS.ANDROID.READ_MEDIA_AUDIO]
            : scope === 'mixed'
              ? [PERMISSIONS.ANDROID.READ_MEDIA_IMAGES, PERMISSIONS.ANDROID.READ_MEDIA_VIDEO]
              : [PERMISSIONS.ANDROID.READ_MEDIA_IMAGES];
      return ensurePermissions(requested, scope === 'audio' ? 'Audio files' : 'Photos and media');
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
