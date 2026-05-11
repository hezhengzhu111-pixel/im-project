/**
 * 媒体文件加密 Web Worker
 *
 * 在后台线程中处理大文件的分块 AES-GCM-256 加密，
 * 避免阻塞主线程 UI 渲染。
 */

/** 主线程发来的加密请求消息 */
interface EncryptMessage {
  type: 'encrypt';
  fileBuffer: ArrayBuffer;
  mediaKeyBase64: string;
  chunkSize: number;
}

self.onmessage = async (e: MessageEvent<EncryptMessage>) => {
  const { fileBuffer, mediaKeyBase64, chunkSize } = e.data;

  try {
    // 从 Base64 还原密钥
    const mediaKeyRaw = base64ToBuffer(mediaKeyBase64);
    const mediaKey = await crypto.subtle.importKey(
      'raw',
      mediaKeyRaw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const totalChunks = Math.ceil(fileBuffer.byteLength / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileBuffer.byteLength);
      const chunk = fileBuffer.slice(start, end);

      // 每个块使用独立的随机 IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedChunk = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        mediaKey,
        chunk,
      );

      const ivBase64 = bufferToBase64(iv);

      // 使用 Transferable 传递 ArrayBuffer 以避免拷贝
      (self as unknown as Worker).postMessage(
        {
          type: 'chunk-done',
          chunkIndex: i,
          encryptedChunk,
          iv: ivBase64,
        },
        [encryptedChunk],
      );
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// ---------------------------------------------------------------------------
// Worker 内部工具函数
// ---------------------------------------------------------------------------

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
