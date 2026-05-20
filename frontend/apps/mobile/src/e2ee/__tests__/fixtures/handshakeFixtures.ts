import { bytesToBase64, base64ToBytes } from '@im/shared-e2ee-core';
import { writeUint32Be } from '../helpers/binaryHelpers';

export const makeHandshake = (signedPreKeyId: number, oneTimePreKeyId: number | null): { bytes: Uint8Array; ephemeralBase64: string } => {
  const bytes = new Uint8Array(40);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = index + 1;
  }
  writeUint32Be(bytes, 32, signedPreKeyId);
  writeUint32Be(bytes, 36, oneTimePreKeyId ?? 0xffffffff);
  return {
    bytes,
    ephemeralBase64: bytesToBase64(bytes.slice(0, 32)),
  };
};

export const handshakeBytes = (
  ephemeralPublic: string,
  signedPreKeyId: number,
  oneTimePreKeyId: number | null,
): Uint8Array => {
  const bytes = new Uint8Array(40);
  bytes.set(base64ToBytes(ephemeralPublic), 0);
  writeUint32Be(bytes, 32, signedPreKeyId);
  writeUint32Be(bytes, 36, oneTimePreKeyId ?? 0xffffffff);
  return bytes;
};
