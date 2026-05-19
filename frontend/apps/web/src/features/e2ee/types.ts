import type {
  E2eeDevice,
  E2eeEnvelope,
  E2eeSessionStatus,
  PreKeyBundle,
  UploadBundleRequest,
} from "@im/shared-e2ee-core";

export type {
  E2eeDevice,
  E2eeEnvelope,
  E2eeSessionStatus,
  PreKeyBundle,
  UploadBundleRequest,
};

export interface RatchetHeader {
  ratchetPublicKey: string;
  counter: number;
  previousCounter: number;
  iv: string;
}

export interface SenderKeyHeader {
  signingPubkey: string;
  counter: number;
  signature: string;
  iv: string;
}

export interface E2eeMessage {
  id: string;
  sessionId: string;
  senderId: string;
  content: string;
  encrypted: boolean;
  isGroup: boolean;
  deviceId?: string;
  header?: RatchetHeader;
  senderKeyHeader?: SenderKeyHeader;
  messageType: string;
  createdTime: string;
}

export interface E2eeNegotiationRequest {
  sessionId: string;
  identityKey?: string;
  signedPreKey?: string;
}

export interface E2eeSessionState {
  sessionId: string;
  status: E2eeSessionStatus;
  requesterId?: string;
}

export interface E2eeGroupState {
  groupId: string;
  status: E2eeSessionStatus;
  enabledBy?: string;
}

export type E2eeEncryptionFailureReason =
  | "missing_recipient_key"
  | "missing_local_private_key"
  | "crypto_failed"
  | "session_not_ready"
  | "device_revoked"
  | "unsupported_browser_crypto";
