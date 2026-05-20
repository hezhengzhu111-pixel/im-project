export const writeUint32Be = (bytes: Uint8Array, offset: number, value: number): void => {
  bytes[offset] = Math.floor(value / 2 ** 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
};

export const readUint32Be = (bytes: Uint8Array, offset: number): number => {
  if (bytes.byteLength < offset + 4) {
    throw new Error('RUST_E2EE_CRYPTO: wire authentication failed');
  }
  return ((bytes[offset] * 2 ** 24) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
};
