import { describe, it, expect } from 'vitest';
import {
  bufferToBase64,
  base64ToBuffer,
  concatBuffers,
  randomBytes,
} from '@/features/e2ee/engine/codec';

describe('e2ee codec', () => {
  it('bufferToBase64 and base64ToBuffer are inverse', () => {
    const original = randomBytes(32);
    const base64 = bufferToBase64(original.buffer as ArrayBuffer);
    const restored = new Uint8Array(base64ToBuffer(base64));
    expect(restored).toEqual(original);
  });

  it('concatBuffers joins multiple buffers', () => {
    const a = new Uint8Array([1, 2, 3]).buffer;
    const b = new Uint8Array([4, 5]).buffer;
    const result = new Uint8Array(concatBuffers(a, b));
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('randomBytes produces correct length', () => {
    expect(randomBytes(32).length).toBe(32);
    expect(randomBytes(12).length).toBe(12);
  });

  it('handles empty buffer', () => {
    const empty = new ArrayBuffer(0);
    const base64 = bufferToBase64(empty);
    const restored = base64ToBuffer(base64);
    expect(restored.byteLength).toBe(0);
  });
});
