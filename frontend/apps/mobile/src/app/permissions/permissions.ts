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
  Alert.alert(`需要${label}权限`, `请在系统设置中开启${label}权限。`, [
    { text: '取消', style: 'cancel' },
    {
      text: '去设置',
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
      ? ensurePermission(PERMISSIONS.ANDROID.CAMERA, '相机')
      : ensurePermission(PERMISSIONS.IOS.CAMERA, '相机'),

  microphone: () =>
    Platform.OS === 'android'
      ? ensurePermission(PERMISSIONS.ANDROID.RECORD_AUDIO, '麦克风')
      : ensurePermission(PERMISSIONS.IOS.MICROPHONE, '麦克风'),

  media: (scope: 'images' | 'videos' | 'audio' | 'mixed' = 'images') => {
    if (Platform.OS !== 'android') {
      return ensurePermission(PERMISSIONS.IOS.PHOTO_LIBRARY, '相册');
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
      return ensurePermissions(requested, scope === 'audio' ? '音频文件' : '照片和媒体');
    }
    return ensurePermission(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE, '文件读取');
  },

  notifications: async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      return ensurePermission('android.permission.POST_NOTIFICATIONS' as Permission, '通知');
    }
    const result = await requestNotifications(['alert', 'badge', 'sound']);
    return result.status === RESULTS.GRANTED || result.status === RESULTS.LIMITED;
  },
};
