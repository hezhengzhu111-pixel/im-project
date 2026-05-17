import ReactNativeBlobUtil from 'react-native-blob-util';
import { STORAGE_KEYS } from '@/constants/config';
import { secureStorage } from '@/services/storage/secureStorage';
import { isLocalUri, mediaExtensionFromUri } from './mediaUri';

const isHttpUri = (value: string) => value.startsWith('http://') || value.startsWith('https://');

const sanitizeName = (value: string) =>
  value
    .split('')
    .map((char) => (/[a-zA-Z0-9._-]/.test(char) ? char : '_'))
    .join('')
    .slice(-140);

const cachePathFor = (uri: string, fallbackExtension: string) => {
  const extension = mediaExtensionFromUri(uri) || fallbackExtension;
  const key = sanitizeName(uri) || `media_${Date.now()}`;
  return `${ReactNativeBlobUtil.fs.dirs.CacheDir}/im_media_v4_${key}.${extension}`;
};

const fileExists = async (path: string) => {
  try {
    return await ReactNativeBlobUtil.fs.exists(path);
  } catch {
    return false;
  }
};

const removeFile = async (path: string) => {
  try {
    if (await ReactNativeBlobUtil.fs.exists(path)) {
      await ReactNativeBlobUtil.fs.unlink(path);
    }
  } catch {
    // cache cleanup is best-effort
  }
};

const authHeaders = async (): Promise<Record<string, string>> => {
  const token = await secureStorage.get(STORAGE_KEYS.accessToken);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const downloadToCache = async (uri: string, path: string) => {
  await removeFile(path);
  const response = await ReactNativeBlobUtil.config({ path, fileCache: true }).fetch('GET', uri, await authHeaders());
  const status = Number(response.info().status || 0);
  if (status < 200 || status >= 300) {
    await removeFile(path);
    throw new Error(`media download failed: HTTP ${status}`);
  }
  return path;
};

export const mediaCache = {
  async localPath(uri: string, fallbackExtension = 'bin'): Promise<string> {
    if (!uri) return '';
    if (isLocalUri(uri)) {
      return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
    }
    if (!isHttpUri(uri)) return uri;

    const path = cachePathFor(uri, fallbackExtension);
    if (!(await fileExists(path))) {
      await downloadToCache(uri, path);
    }
    return path;
  },

  async imageUri(uri: string): Promise<string> {
    const path = await this.localPath(uri, 'jpg');
    if (!path) return '';
    if (path.startsWith('content://') || path.startsWith('file://')) return path;
    return `file://${path}`;
  },
};
