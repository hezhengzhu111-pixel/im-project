export type E2eeSessionStatus = "plaintext" | "negotiating" | "encrypted" | "failed";

export interface EncodedKeyPair {
  privateKey: string;
  publicKey: string;
}

export type EncodedEcdhKeyPair = EncodedKeyPair;
export type EncodedEcdsaKeyPair = EncodedKeyPair;

export interface EncodedBundle {
  identityKey: string;
  signingIdentityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKeys: string[];
}

export interface UploadBundleRequest extends EncodedBundle {
  deviceId: string;
}

export interface KeyBundle {
  identityKeyPair: EncodedEcdhKeyPair;
  signingIdentityKeyPair: EncodedEcdsaKeyPair;
  signedPreKeyPair: EncodedEcdhKeyPair;
  oneTimePreKeyPairs: EncodedEcdhKeyPair[];
  bundle: EncodedBundle;
}

export interface PreKeyBundle {
  userId?: string;
  deviceId?: string;
  identityKey: string;
  signingIdentityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  oneTimePreKeys?: string[];
}

export interface E2eeDevice {
  userId?: string;
  deviceId: string;
  identityKey?: string;
  signedPreKey?: string;
  lastActiveAt?: string;
  last_active_at?: string;
  status?: string;
}

export interface X3dhResult {
  rootKey: string;
  ephemeralPublicKey: string;
  ephemeralKeyPair: EncodedEcdhKeyPair;
}

export interface RatchetHeader {
  ratchetPublicKey: string;
  counter: number;
  previousCounter: number;
  iv: string;
}

export interface SerializedSkippedMessageKey {
  key: string;
  messageKey: string;
}

export interface RatchetState {
  rootKey: string;
  sendingChainKey: string | null;
  receivingChainKey: string | null;
  sendCounter: number;
  receiveCounter: number;
  previousCounter: number;
  dhKeyPair: EncodedEcdhKeyPair;
  remotePublicKey: string | null;
  skippedMessageKeys: Record<string, string>;
}

export interface InitialE2eeHandshake {
  senderIdentityKey: string;
  ephemeralPublicKey: string;
  deviceId: string;
}

export interface PendingEncryptionRequest {
  sessionId: string;
  requesterId?: string;
  requesterName?: string;
  targetUserId?: string;
  requestPayloadJson?: string;
}

