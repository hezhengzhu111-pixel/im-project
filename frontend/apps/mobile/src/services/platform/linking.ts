import { Linking } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

export const platformLinking = {
  openUrl: (url: string) => Linking.openURL(url),
  openFile: (path: string, mimeType?: string) =>
    ReactNativeBlobUtil.android.actionViewIntent(path, mimeType || 'application/octet-stream'),
};
