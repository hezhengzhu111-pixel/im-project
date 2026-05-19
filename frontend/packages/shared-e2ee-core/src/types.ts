export const RUST_E2EE_ENVELOPE_VERSION = 2 as const;
export const RUST_E2EE_ALGORITHM = "rust-x25519-x3dh-dr-v1" as const;

export type E2eeSessionStatus = "plaintext" | "negotiating" | "encrypted" | "failed";

export interface RustPreKey {
  id: number;
  key: string;
}

export interface RustPublicPreKeyBundle {
  userId?: string;
  deviceId?: string;
  identityKey: string;
  signingKey: string;
  signedPreKey: RustPreKey;
  signedPreKeySignature: string;
  oneTimePreKey?: RustPreKey | null;
  oneTimePreKeys?: RustPreKey[];
}

export interface RustOneTimePreKeyPair {
  id: number;
  keyPairBincode: string;
  publicKey: string;
}

export interface RustLocalE2eeKeyMaterial {
  version: typeof RUST_E2EE_ENVELOPE_VERSION;
  identityKeyPairBincode: string;
  signedPreKeyPairBincode: string;
  oneTimePreKeyPairs: RustOneTimePreKeyPair[];
  publicBundle: RustPublicPreKeyBundle;
}

export interface GeneratePreKeyBundleOptions {
  signedPreKeyId?: number;
  oneTimePreKeyStartId?: number;
  oneTimePreKeyCount?: number;
}

export interface RustE2eeEnvelope {
  version: typeof RUST_E2EE_ENVELOPE_VERSION;
  algorithm: typeof RUST_E2EE_ALGORITHM;
  senderDeviceId: string;
  recipientDeviceId: string;
  sessionId: string;
  handshake?: string;
  wire: string;
}

export interface E2eeDevice {
  userId?: string;
  deviceId: string;
  identityKey?: string;
  signingKey?: string;
  signedPreKey?: RustPreKey | string;
  lastActiveAt?: string;
  last_active_at?: string;
  status?: string;
}

export interface PendingEncryptionRequest {
  sessionId: string;
  requesterId?: string;
  requesterName?: string;
  targetUserId?: string;
  requestPayloadJson?: string;
}

export interface InitialE2eeHandshake {
  senderIdentityKey: string;
  handshake: string;
  deviceId: string;
}

export interface UploadBundleRequest {
  deviceId: string;
  identityKey: string;
  signingIdentityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKeys: RustPreKey[];
}

export type PreKeyBundle = RustPublicPreKeyBundle;
export type E2eeEnvelope = RustE2eeEnvelope;
