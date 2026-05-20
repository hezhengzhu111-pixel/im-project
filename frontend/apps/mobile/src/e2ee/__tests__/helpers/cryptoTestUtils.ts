import { bytesToBase64, utf8ToBytes, type Base64String } from '@im/shared-e2ee-core';

export const b64 = (value: string): string => bytesToBase64(utf8ToBytes(value));

export const digestBytes = (label: string, length: number): Uint8Array => {
  let seed = 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    seed = Math.imul(seed ^ label.charCodeAt(index), 0x01000193) >>> 0;
  }
  const output = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    seed = Math.imul(seed ^ index, 0x01000193) >>> 0;
    output[index] = seed & 0xff;
  }
  return output;
};

export const fixedKey = (label: string): Base64String => bytesToBase64(digestBytes(label, 32));

export const tagFor = (secret: string, sequence: number, plaintextBase64: string): Base64String =>
  bytesToBase64(digestBytes(`${secret}:${sequence}:${plaintextBase64}`, 16));

export const deriveSecret = (input: {
  aliceIdentityPublic: string;
  bobIdentityPublic: string;
  bobSignedPreKeyPublic: string;
  bobOneTimePreKeyPublic: string | null;
  ephemeralPublic: string;
}): Base64String =>
  bytesToBase64(utf8ToBytes([
    input.aliceIdentityPublic,
    input.bobIdentityPublic,
    input.bobSignedPreKeyPublic,
    input.bobOneTimePreKeyPublic ?? 'NO_OTK',
    input.ephemeralPublic,
  ].join('|')));
