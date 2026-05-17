import Clipboard from '@react-native-clipboard/clipboard';

export const platformClipboard = {
  copyText: (text: string): void => {
    try {
      Clipboard.setString(text);
    } catch (error) {
      throw new Error(
        `Failed to copy text: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  },
};
