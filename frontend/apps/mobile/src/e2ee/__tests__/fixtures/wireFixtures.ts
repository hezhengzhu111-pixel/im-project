import { bytesToBase64, concatBytes, utf8ToBytes, type Base64String } from '@im/shared-e2ee-core';
import { writeUint32Be } from '../helpers/binaryHelpers';
import { digestBytes, tagFor } from '../helpers/cryptoTestUtils';

export const RUST_RATCHET_HEADER_LEN = 52;
export const WIRE_PREFIX_LEN = 4;

export const makeWire = (): Uint8Array => {
  const wire = new Uint8Array(WIRE_PREFIX_LEN + RUST_RATCHET_HEADER_LEN + 4);
  wire.set([0, 0, 0, RUST_RATCHET_HEADER_LEN], 0);
  wire.fill(1, WIRE_PREFIX_LEN);
  return wire;
};

export type MockSession = {
  sessionId: string;
  secret: string;
  nextSequence: number;
};

export const authenticatedWire = (session: MockSession, plaintextBase64: string): Base64String => {
  const sequence = session.nextSequence;
  session.nextSequence += 1;
  const header = digestBytes(`header:${session.secret}:${sequence}`, RUST_RATCHET_HEADER_LEN);
  const payload = utf8ToBytes(JSON.stringify({
    sequence,
    plaintext: plaintextBase64,
    tag: tagFor(session.secret, sequence, plaintextBase64),
  }));
  const prefix = new Uint8Array(WIRE_PREFIX_LEN);
  writeUint32Be(prefix, 0, RUST_RATCHET_HEADER_LEN);
  return bytesToBase64(concatBytes(prefix, header, payload));
};

export const authenticationError = (): Error =>
  new Error('RUST_E2EE_CRYPTO: wire authentication failed');

export const sessionNotFoundError = (sessionId: string): Error =>
  new Error(`RUST_E2EE_SESSION_NOT_FOUND: ${sessionId}`);
