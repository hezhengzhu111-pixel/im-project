import { APP_CONFIG } from '@/constants/config';
import type { MessageType } from '@im/shared-types';

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'aac', 'wav', 'ogg', 'amr']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi']);

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

const fileBase = () => trimTrailingSlash(APP_CONFIG.FILE_BASE_URL || APP_CONFIG.API_BASE_URL.replace(/\/api\/?$/, ''));

export const resolveMediaUri = (uri?: string | null, type?: MessageType): string => {
  const value = String(uri || '').trim();
  if (!value) return '';
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
