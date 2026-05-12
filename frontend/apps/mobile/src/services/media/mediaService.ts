import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick } from '@react-native-documents/picker';
import NitroSound from 'react-native-nitro-sound';
import Clipboard from '@react-native-clipboard/clipboard';
import { permissions } from '@/app/permissions/permissions';
import type { MobileFile } from '@/services/file/fileService';

const firstAssetToFile = (asset?: { uri?: string; fileName?: string; type?: string; fileSize?: number }): MobileFile | null => {
  if (!asset?.uri) {
    return null;
  }
  return {
    uri: asset.uri,
    name: asset.fileName || `media_${Date.now()}`,
    type: asset.type,
    size: asset.fileSize,
  };
};

export const mediaService = {
  async takePhoto(): Promise<MobileFile | null> {
    if (!(await permissions.camera())) {
      return null;
    }
    const response = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    return firstAssetToFile(response.assets?.[0]);
  },

  async pickImage(): Promise<MobileFile | null> {
    if (!(await permissions.media())) {
      return null;
    }
    const response = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 });
    return firstAssetToFile(response.assets?.[0]);
  },

  async pickDocument(): Promise<MobileFile | null> {
    const [result] = await pick();
    if (!result) {
      return null;
    }
    return {
      uri: result.uri,
      name: result.name || `file_${Date.now()}`,
      type: result.type || undefined,
      size: result.size || undefined,
    };
  },

  async startVoiceRecording(path: string): Promise<void> {
    if (!(await permissions.microphone())) {
      throw new Error('Microphone permission denied');
    }
    await NitroSound.startRecorder(path);
  },

  async stopVoiceRecording(): Promise<string> {
    return NitroSound.stopRecorder();
  },

  playAudio: (url: string) => NitroSound.startPlayer(url),
  stopAudio: () => NitroSound.stopPlayer(),
  copyText: (text: string) => Clipboard.setString(text),
};
