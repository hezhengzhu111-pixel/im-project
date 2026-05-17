import { APP_CONFIG } from '@/constants/config';
import type { MessageType } from '@im/shared-types';

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'aac', 'wav', 'ogg', 'amr']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi']);

type FileLocator = {
  category: string;
  date: string;
  filename: string;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, '');

const isAbsoluteUri = (value: string) => /^(https?:|file:|content:|data:|blob:)/i.test(value);

const extensionFrom = (value: string) => {
  const clean = value.split('?')[0].split('#')[0];
  const name = clean.split('/').filter(Boolean).pop() || '';
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

const mediaFolderFor = (value: string, type?: MessageType) => {
  const ext = extensionFrom(value);
  if (type === 'VOICE' || AUDIO_EXTENSIONS.has(ext)) return 'audios';
  if (type === 'IMAGE' || IMAGE_EXTENSIONS.has(ext)) return 'images';
  if (type === 'VIDEO' || VIDEO_EXTENSIONS.has(ext)) return 'videos';
  return 'files';
};

const apiBase = () => trimTrailingSlash(APP_CONFIG.API_BASE_URL);
const fileBase = () => trimTrailingSlash(APP_CONFIG.FILE_BASE_URL || APP_CONFIG.API_BASE_URL.replace(/\/api\/?$/, ''));

const locatorFromFilesPath = (path: string): FileLocator | null => {
  const cleanPath = `/${trimLeadingSlash(path.split('?')[0].split('#')[0])}`;
  const match = cleanPath.match(/^\/files\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    category: decodeURIComponent(match[1]),
    date: decodeURIComponent(match[2]),
    filename: decodeURIComponent(match[3]),
  };
};

const locatorFromDownloadSearch = (search: string): FileLocator | null => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const category = params.get('category') || '';
  const date = params.get('date') || '';
  const filename = params.get('filename') || '';
  if (!category || !date || !filename) return null;
  return { category, date, filename };
};

const locatorFromUri = (value: string): FileLocator | null => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const fromPath = locatorFromFilesPath(parsed.pathname);
      if (fromPath) return fromPath;
      if (parsed.pathname.endsWith('/file/download') || parsed.pathname.endsWith('/api/file/download')) {
        return locatorFromDownloadSearch(parsed.search);
      }
      return null;
    } catch {
      return null;
    }
  }
  if (value.includes('/file/download')) {
    const search = value.split('?')[1] || '';
    return locatorFromDownloadSearch(search);
  }
  return locatorFromFilesPath(value);
};

export const buildMediaDownloadUri = (locator: FileLocator): string => {
  const params = new URLSearchParams({
    category: locator.category,
    date: locator.date,
    filename: locator.filename,
  });
  return `${apiBase()}/file/download?${params.toString()}`;
};

export const resolveMediaUri = (uri?: string | null, type?: MessageType): string => {
  const value = String(uri || '').trim();
  if (!value) return '';

  const locator = locatorFromUri(value);
  if (locator) return buildMediaDownloadUri(locator);

  if (isAbsoluteUri(value)) return value;

  const base = fileBase();
  if (value.startsWith('/')) {
    return `${base}${value}`;
  }

  if (value.includes('/')) {
    return `${base}/${trimLeadingSlash(value)}`;
  }

  return `${base}/files/${mediaFolderFor(value, type)}/${value}`;
};

export const isRemoteUri = (uri?: string | null): boolean => /^https?:\/\//i.test(String(uri || '').trim());

export const isLocalUri = (uri?: string | null): boolean => /^(file:|content:)/i.test(String(uri || '').trim());

export const isLikelyMediaFilename = (value?: string | null): boolean => {
  const text = String(value || '').trim();
  if (!text) return false;
  const ext = extensionFrom(text);
  return AUDIO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
};

export const mediaExtensionFromUri = (value?: string | null): string => {
  const raw = String(value || '');
  const locator = locatorFromUri(raw);
  if (locator) return extensionFrom(locator.filename) || 'bin';
  return extensionFrom(raw) || 'bin';
};
