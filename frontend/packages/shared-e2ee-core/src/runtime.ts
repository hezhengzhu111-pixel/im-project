import type {
  GeneratePreKeyBundleOptions,
  RustE2eeEnvelope,
  RustLocalE2eeKeyMaterial,
  RustPublicPreKeyBundle,
} from "./types";

export interface CreateInboundSessionInput {
  sessionId: string;
  localKeys: RustLocalE2eeKeyMaterial;
  remoteIdentityKey: string;
  handshake: Uint8Array | string;
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
  encrypt(sessionId: string, plaintext: Uint8Array | string): Promise<Uint8Array>;
  decrypt(sessionId: string, encryptedWire: Uint8Array | string | RustE2eeEnvelope): Promise<Uint8Array>;
  exportSession(sessionId: string): Promise<Uint8Array>;
  restoreSession(sessionId: string, stateBytes: Uint8Array | string): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
}
