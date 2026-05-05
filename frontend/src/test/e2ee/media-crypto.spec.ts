import { describe, it, expect } from 'vitest';
import { encryptMedia, decryptMedia } from '@/features/e2ee/engine/media-crypto';

/** 将 ArrayBufferLike 安全转为 ArrayBuffer（兼容 SharedArrayBuffer 场景） */
function ab(data: ArrayBufferLike): ArrayBuffer {
  const bytes = new Uint8Array(data);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

describe('e2ee media-crypto', () => {
  // ---------------------------------------------------------------------------
  // 辅助函数
  // ---------------------------------------------------------------------------

  /** 创建指定大小的测试文件 */
  function createTestFile(size: number, mimeType = 'application/octet-stream'): File {
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);
    // 填充非零数据
    for (let i = 0; i < size; i++) {
      view[i] = i % 256;
    }
    return new File([buffer], 'test-file.bin', { type: mimeType });
  }

  /**
   * 读取 Blob 为 ArrayBuffer
   *
   * 兼容 jsdom 环境（Blob.arrayBuffer() 不可用时使用 FileReader）
   */
  function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * 读取 File 为 ArrayBuffer
   *
   * 兼容 jsdom 环境
   */
  function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  // ---------------------------------------------------------------------------
  // 加密/解密往返测试
  // ---------------------------------------------------------------------------

  it('encrypt/decrypt round-trip for small file', async () => {
    const originalData = new TextEncoder().encode('Hello, E2EE media encryption!');
    const file = new File([originalData], 'test.txt', { type: 'text/plain' });

    const encrypted = await encryptMedia(file);

    // 验证加密结果结构
    expect(encrypted.encryptedChunks).toHaveLength(1);
    expect(encrypted.mediaKey).toBeTruthy();
    expect(encrypted.chunkIvs).toHaveLength(1);

    // 解密
    const decrypted = await decryptMedia({
      encryptedChunks: encrypted.encryptedChunks,
      mediaKey: encrypted.mediaKey,
      chunkIvs: encrypted.chunkIvs,
      mimeType: 'text/plain',
    });

    // 验证解密结果
    const decryptedBuffer = ab(await readBlobAsArrayBuffer(decrypted));
    const decryptedArray = Array.from(new Uint8Array(decryptedBuffer));
    const originalArray = Array.from(originalData);
    expect(decryptedArray).toEqual(originalArray);
    expect(decrypted.type).toBe('text/plain');
  });

  it('encrypt/decrypt round-trip for binary file', async () => {
    const file = createTestFile(1024, 'application/octet-stream');

    const encrypted = await encryptMedia(file);

    const decrypted = await decryptMedia({
      encryptedChunks: encrypted.encryptedChunks,
      mediaKey: encrypted.mediaKey,
      chunkIvs: encrypted.chunkIvs,
      mimeType: 'application/octet-stream',
    });

    const originalBuffer = await readFileAsArrayBuffer(file);
    const decryptedBuffer = await readBlobAsArrayBuffer(decrypted);
    expect(new Uint8Array(decryptedBuffer)).toEqual(new Uint8Array(originalBuffer));
  });

  // ---------------------------------------------------------------------------
  // 加密数据验证
  // ---------------------------------------------------------------------------

  it('encrypted data differs from original', async () => {
    const originalData = new TextEncoder().encode('Secret message');
    const file = new File([originalData], 'secret.txt', { type: 'text/plain' });

    const encrypted = await encryptMedia(file);

    const encryptedBuffer = await readBlobAsArrayBuffer(encrypted.encryptedChunks[0]);
    const originalBuffer = await readFileAsArrayBuffer(file);

    // 密文不应与明文相同
    expect(new Uint8Array(encryptedBuffer)).not.toEqual(new Uint8Array(originalBuffer));
  });

  it('different encryptions produce different ciphertexts', async () => {
    const originalData = new TextEncoder().encode('Same content, different encryption');
    const file1 = new File([originalData], 'file1.txt', { type: 'text/plain' });
    const file2 = new File([originalData], 'file2.txt', { type: 'text/plain' });

    const encrypted1 = await encryptMedia(file1);
    const encrypted2 = await encryptMedia(file2);

    // 两次加密的密文应不同（因为 IV 和密钥不同）
    const ciphertext1 = await readBlobAsArrayBuffer(encrypted1.encryptedChunks[0]);
    const ciphertext2 = await readBlobAsArrayBuffer(encrypted2.encryptedChunks[0]);
    expect(new Uint8Array(ciphertext1)).not.toEqual(new Uint8Array(ciphertext2));

    // 密钥也应不同
    expect(encrypted1.mediaKey).not.toBe(encrypted2.mediaKey);
  });

  // ---------------------------------------------------------------------------
  // 错误处理
  // ---------------------------------------------------------------------------

  it('decrypt fails with wrong key', async () => {
    const file = new File([new TextEncoder().encode('test')], 'test.txt', { type: 'text/plain' });

    const encrypted = await encryptMedia(file);

    // 使用错误的密钥尝试解密
    const wrongKeyEncrypted = await encryptMedia(
      new File([new TextEncoder().encode('dummy')], 'dummy.txt', { type: 'text/plain' }),
    );

    await expect(
      decryptMedia({
        encryptedChunks: encrypted.encryptedChunks,
        mediaKey: wrongKeyEncrypted.mediaKey, // 错误的密钥
        chunkIvs: encrypted.chunkIvs,
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow();
  });

  it('decrypt fails with wrong IV', async () => {
    const file = new File([new TextEncoder().encode('test')], 'test.txt', { type: 'text/plain' });

    const encrypted = await encryptMedia(file);

    // 使用错误的 IV 尝试解密
    const wrongIvEncrypted = await encryptMedia(
      new File([new TextEncoder().encode('dummy')], 'dummy.txt', { type: 'text/plain' }),
    );

    await expect(
      decryptMedia({
        encryptedChunks: encrypted.encryptedChunks,
        mediaKey: encrypted.mediaKey,
        chunkIvs: wrongIvEncrypted.chunkIvs, // 错误的 IV
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // 边界情况
  // ---------------------------------------------------------------------------

  it('handles empty file', async () => {
    const file = new File([], 'empty.txt', { type: 'text/plain' });

    // 空文件加密应正常工作（AES-GCM 可以加密空数据）
    const encrypted = await encryptMedia(file);
    expect(encrypted.encryptedChunks).toHaveLength(1);

    const decrypted = await decryptMedia({
      encryptedChunks: encrypted.encryptedChunks,
      mediaKey: encrypted.mediaKey,
      chunkIvs: encrypted.chunkIvs,
      mimeType: 'text/plain',
    });

    const decryptedBuffer = await readBlobAsArrayBuffer(decrypted);
    expect(decryptedBuffer.byteLength).toBe(0);
  });

  it('preserves MIME type in decrypted blob', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' });

    const encrypted = await encryptMedia(file);
    const decrypted = await decryptMedia({
      encryptedChunks: encrypted.encryptedChunks,
      mediaKey: encrypted.mediaKey,
      chunkIvs: encrypted.chunkIvs,
      mimeType: 'image/png',
    });

    expect(decrypted.type).toBe('image/png');
  });
});
