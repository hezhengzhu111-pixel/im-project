export const RUST_RATCHET_HEADER_LEN = 52;
export const RUST_WIRE_HEADER_PREFIX_LEN = 4;

export interface RustHandshake {
  ephemeralPublicKey: Uint8Array;
  signedPreKeyId: number;
  oneTimePreKeyId: number | null;
}

const readUint32Be = (bytes: Uint8Array, offset: number): number => {
  if (bytes.byteLength < offset + 4) {
    throw new Error("invalid rust e2ee uint32");
  }
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  return ((b0 * 2 ** 24) + (b1 << 16) + (b2 << 8) + b3) >>> 0;
};

export const readRustWireHeaderLength = (wire: Uint8Array): number => {
  if (wire.byteLength < RUST_WIRE_HEADER_PREFIX_LEN) {
    throw new Error("rust e2ee wire too short");
  }
  return readUint32Be(wire, 0);
};

export const assertRustWireFormat = (wire: Uint8Array): void => {
  const headerLength = readRustWireHeaderLength(wire);
  if (headerLength !== RUST_RATCHET_HEADER_LEN) {
    throw new Error(`invalid rust e2ee header length: ${headerLength}`);
  }
  if (wire.byteLength <= RUST_WIRE_HEADER_PREFIX_LEN + RUST_RATCHET_HEADER_LEN) {
    throw new Error("rust e2ee wire missing ciphertext");
  }
};

export const parseRustHandshake = (handshake: Uint8Array): RustHandshake => {
  if (handshake.byteLength !== 40) {
    throw new Error("invalid rust e2ee handshake length");
  }
  const ephemeralPublicKey = handshake.slice(0, 32);
  const signedPreKeyId = readUint32Be(handshake, 32);
  const otkId = readUint32Be(handshake, 36);
  return {
    ephemeralPublicKey,
    signedPreKeyId,
    oneTimePreKeyId: otkId === 0xffffffff ? null : otkId,
  };
};
