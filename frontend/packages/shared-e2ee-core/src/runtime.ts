import type {
  GeneratePreKeyBundleOptions,
  RustE2eeEnvelope,
  RustLocalE2eeKeyMaterial,
  RustPublicPreKeyBundle,
} from "./types";
import type { Base64String } from "./bytes";

export type BinaryInput = Uint8Array | Base64String;

export interface CreateInboundSessionInput {
  sessionId: string;
  localKeys: RustLocalE2eeKeyMaterial;
  remoteIdentityKey: string;
  /** Binary Rust handshake bytes. String input must be Base64String, not plaintext. */
  handshake: BinaryInput;
}

export interface CreateOutboundSessionInput {
  sessionId: string;
  localKeys: RustLocalE2eeKeyMaterial;
  remoteBundle: RustPublicPreKeyBundle;
}

export interface E2eeRuntime {
  createIdentity(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial>;
  generatePreKeyBundle(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial>;
  createOutboundSession(input: CreateOutboundSessionInput): Promise<Uint8Array>;
  createInboundSession(input: CreateInboundSessionInput): Promise<void>;
  /** String plaintext is intentionally UTF-8 text for compatibility; binary strings use Base64String elsewhere. */
  encrypt(sessionId: string, plaintext: Uint8Array | string): Promise<Uint8Array>;
  decrypt(sessionId: string, encryptedWire: BinaryInput | RustE2eeEnvelope): Promise<Uint8Array>;
  exportSession(sessionId: string): Promise<Uint8Array>;
  restoreSession(sessionId: string, stateBytes: BinaryInput): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
}
