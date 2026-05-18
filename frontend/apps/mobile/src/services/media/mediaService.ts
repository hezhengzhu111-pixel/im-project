import ReactNativeBlobUtil from 'react-native-blob-util';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { keepLocalCopy, pick, types as documentPickerTypes } from '@react-native-documents/picker';
import NitroSound from 'react-native-nitro-sound';
import Clipboard from '@react-native-clipboard/clipboard';
import { permissions } from '@/app/permissions/permissions';
import type { MobileFile } from '@/services/file/fileService';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  txt: 'text/plain',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const extensionFromName = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

const inferNameFromUri = (uri: string, prefix: string): string => {
  const sanitized = uri.split('?')[0].split('#')[0];
  const candidate = sanitized.split('/').filter(Boolean).pop();
  return candidate || `${prefix}_${Date.now()}`;
};

const ensureFileUri = (path: string): string => {
  if (!path) {
    return path;
  }
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
};

const safeStatSize = async (uri: string): Promise<number | undefined> => {
  const normalizedPath = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
  if (!normalizedPath || normalizedPath.startsWith('content://')) {
    return undefined;
  }
  try {
    const stat = await ReactNativeBlobUtil.fs.stat(normalizedPath);
    return Number(stat.size || 0) || undefined;
  } catch {
    return undefined;
  }
};

const normalizeFile = async (file: MobileFile, prefix: string, fallbackType?: string): Promise<MobileFile> => {
  const name = file.name?.trim() || inferNameFromUri(file.uri, prefix);
  const extension = extensionFromName(name);
  const uri = ensureFileUri(file.uri);
  return {
    ...file,
    uri,
    name,
    type: file.type || MIME_BY_EXTENSION[extension] || fallbackType,
    size: file.size || (await safeStatSize(uri)),
  };
};

const resolveDocumentUri = async (
  uri: string,
  fileName: string,
  convertVirtualFileToType?: string,
): Promise<string> => {
  if (!uri.startsWith('content://')) {
    return uri;
  }
  const [copied] = await keepLocalCopy({
    destination: 'cachesDirectory',
    files: [{ uri, fileName, convertVirtualFileToType }],
  });
  if (copied?.status === 'success') {
    return copied.localUri;
  }
  return uri;
};

const firstAssetToFile = async (asset?: {
  uri?: string;
  originalPath?: string;
  fileName?: string;
  type?: string;
  fileSize?: number;
  duration?: number;
}): Promise<MobileFile | null> => {
  if (!asset?.uri && !asset?.originalPath) {
    return null;
  }
  const uri =
    asset.uri?.startsWith('content://') && asset.originalPath
      ? ensureFileUri(asset.originalPath)
      : ensureFileUri(asset.uri || asset.originalPath || '');
  return normalizeFile(
    {
      uri,
      originalUri: asset.uri,
      name: asset.fileName || inferNameFromUri(uri, 'media'),
      type: asset.type,
      size: asset.fileSize,
      duration: asset.duration,
    },
    'media',
    asset.type,
  );
};

export const buildVoiceFile = async (uri: string, durationMs?: number): Promise<MobileFile> =>
  normalizeFile(
    {
      uri,
      name: inferNameFromUri(uri, 'voice').includes('.') ? inferNameFromUri(uri, 'voice') : `voice_${Date.now()}.m4a`,
      type: 'audio/mp4',
      duration: durationMs,
    },
    'voice',
    'audio/mp4',
  );

const createVoiceRecordingPath = (): string =>
  `${ReactNativeBlobUtil.fs.dirs.CacheDir}/voice_${Date.now()}.m4a`;

export const mediaService = {
  async takePhoto(): Promise<MobileFile | null> {
    if (!(await permissions.camera())) {
      return null;
    }
    const response = await launchCamera({ mediaType: 'photo', quality: 0.8, includeExtra: true });
    return firstAssetToFile(response.assets?.[0]);
  },

  async pickImage(): Promise<MobileFile | null> {
    if (!(await permissions.media('mixed'))) {
      return null;
    }
    const response = await launchImageLibrary({
      mediaType: 'mixed',
      selectionLimit: 1,
      includeExtra: true,
      assetRepresentationMode: 'current',
    });
    return firstAssetToFile(response.assets?.[0]);
  },

  async pickDocument(): Promise<MobileFile | null> {
    const [result] = await pick({
      type: [documentPickerTypes.allFiles],
      allowVirtualFiles: true,
    });
    if (!result) {
      return null;
    }
    const initialName = result.name || inferNameFromUri(result.uri, 'file');
    const uri = await resolveDocumentUri(
      result.uri,
      initialName,
      result.isVirtual ? result.convertibleToMimeTypes?.[0]?.mimeType : undefined,
    );
    const fileName = result.name || inferNameFromUri(uri, 'file');
    return normalizeFile(
      {
        uri,
        originalUri: result.uri,
        name: fileName,
        type: result.type || result.nativeType || undefined,
        size: result.size || undefined,
      },
      'file',
      result.type || result.nativeType || undefined,
    );
  },

  async startVoiceRecording(path = createVoiceRecordingPath()): Promise<string> {
    if (!(await permissions.microphone())) {
      throw new Error('Microphone permission denied');
    }
    await NitroSound.startRecorder(path);
    return path;
  },

  async stopVoiceRecording(durationMs?: number): Promise<MobileFile> {
    const path = await NitroSound.stopRecorder();
    return buildVoiceFile(path, durationMs);
  },

  playAudio: (url: string) => NitroSound.startPlayer(url),
  stopAudio: () => NitroSound.stopPlayer(),
  copyText: (text: string) => Clipboard.setString(text),
};
