import { Linking } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

export const platformLinking = {
  openUrl: async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      throw new Error(
        `Failed to open URL: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  },

  openFile: async (path: string, mimeType?: string) => {
    try {
      await ReactNativeBlobUtil.android.actionViewIntent(
        path,
        mimeType || 'application/octet-stream',
      );
    } catch (error) {
      throw new Error(
        `Failed to open file: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  },
};
