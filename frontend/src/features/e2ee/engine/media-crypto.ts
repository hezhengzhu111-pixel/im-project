/**
 * E2EE 媒体文件加密引擎
 *
 * 使用 AES-GCM-256 对媒体文件进行分块加密。
 * 小文件（≤5MB）在主线程处理，大文件使用 Web Worker。
 */

import { randomBytes } from './codec';

/** 大文件阈值：5MB */
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

/** 分块大小：5MB */
const CHUNK_SIZE = 5 * 1024 * 1024;

/** 加密后的媒体结果 */
export interface EncryptedMediaResult {
  /** 加密后的数据块 */
  encryptedChunks: Blob[];
  /** Base64 编码的媒体密钥 */
  mediaKey: string;
  /** 每个块的 Base64 编码 IV */
  chunkIvs: string[];
}

/** 解密媒体参数 */
export interface MediaDecryptParams {
  /** 加密的数据块 */
  encryptedChunks: Blob[];
  /** Base64 编码的媒体密钥 */
  mediaKey: string;
  /** 每个块的 Base64 编码 IV */
  chunkIvs: string[];
  /** 原始 MIME 类型 */
  mimeType: string;
}

/**
 * 加密媒体文件
 *
 * 根据文件大小自动选择主线程或 Web Worker 处理。
 */
export async function encryptMedia(file: File): Promise<EncryptedMediaResult> {
  if (file.size > LARGE_FILE_THRESHOLD) {
    return encryptMediaWithWorker(file);
  }
  return encryptMediaInMainThread(file);
}

/**
 * 主线程加密（小文件）
 */
async function encryptMediaInMainThread(file: File): Promise<EncryptedMediaResult> {
  const mediaKeyRaw = randomBytes(32);
  const mediaKey = await crypto.subtle.importKey(
    'raw',
    mediaKeyRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const fileBuffer = await readFileAsArrayBuffer(file);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    mediaKey,
    fileBuffer,
  );

  return {
    encryptedChunks: [new Blob([ciphertext])],
    mediaKey: bufferToBase64(mediaKeyRaw),
    chunkIvs: [bufferToBase64(iv)],
  };
}

/**
 * Web Worker 加密（大文件）
 */
async function encryptMediaWithWorker(file: File): Promise<EncryptedMediaResult> {
  const mediaKeyRaw = randomBytes(32);
  const mediaKeyBase64 = bufferToBase64(mediaKeyRaw);

  const fileBuffer = await readFileAsArrayBuffer(file);
  const totalChunks = Math.ceil(fileBuffer.byteLength / CHUNK_SIZE);

  const worker = new Worker(
    new URL('../workers/media-crypto.worker.ts', import.meta.url),
    { type: 'module' },
  );

  return new Promise((resolve, reject) => {
    const encryptedChunks: Blob[] = [];
    const chunkIvs: string[] = [];
    let processedChunks = 0;

    worker.onmessage = (e: MessageEvent) => {
      const { type, chunkIndex, encryptedChunk, iv, error } = e.data;

      if (type === 'error') {
        worker.terminate();
        reject(new Error(error));
        return;
      }

      if (type === 'chunk-done') {
        encryptedChunks[chunkIndex] = new Blob([encryptedChunk]);
        chunkIvs[chunkIndex] = iv;
        processedChunks++;

        if (processedChunks === totalChunks) {
          worker.terminate();
          resolve({ encryptedChunks, mediaKey: mediaKeyBase64, chunkIvs });
        }
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(e.error || new Error('Worker error'));
    };

    worker.postMessage({
      type: 'encrypt',
      fileBuffer,
      mediaKeyBase64,
      chunkSize: CHUNK_SIZE,
    });
  });
}

/**
 * 解密媒体文件
 *
 * 将加密的数据块解密并合并为原始文件 Blob。
 */
export async function decryptMedia(params: MediaDecryptParams): Promise<Blob> {
  const mediaKeyRaw = base64ToBuffer(params.mediaKey);
  const mediaKey = await crypto.subtle.importKey(
    'raw',
    mediaKeyRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const decryptedParts: ArrayBuffer[] = [];

  for (let i = 0; i < params.encryptedChunks.length; i++) {
    const chunkBuffer = await readFileAsArrayBuffer(params.encryptedChunks[i]);
    const iv = base64ToBuffer(params.chunkIvs[i]);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      mediaKey,
      chunkBuffer,
    );
    decryptedParts.push(decrypted);
  }

  return new Blob(decryptedParts, { type: params.mimeType });
}

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

/**
 * 读取 File/Blob 为 ArrayBuffer
 *
 * 兼容 jsdom 环境（File.arrayBuffer() 不可用时使用 FileReader）
 */
async function readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  // Fallback: 使用 FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** ArrayBuffer/Uint8Array → Base64 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Base64 → Uint8Array */
function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
