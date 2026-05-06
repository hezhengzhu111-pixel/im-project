/** E2EE 会话加密状态 */
export type E2eeSessionStatus = 'plaintext' | 'negotiating' | 'encrypted' | 'failed';

/** 设备信息 */
export interface E2eeDevice {
  deviceId: string;
  identityKey: string;       // Base64
  signedPreKey: string;      // Base64
  lastActiveAt: string;
}

/** 公钥 Bundle（从服务端获取） */
export interface PreKeyBundle {
  userId: string;
  deviceId: string;
  identityKey: string;           // Base64
  signingIdentityKey: string;    // Base64
  signedPreKey: string;          // Base64
  signedPreKeySignature: string; // Base64
  oneTimePreKey?: string;        // Base64, 可选
}

/** 上传公钥 Bundle 请求 */
export interface UploadBundleRequest {
  deviceId: string;
  identityKey: string;              // Base64
  signingIdentityKey: string;       // Base64
  signedPreKey: string;             // Base64
  signedPreKeySignature: string;    // Base64
  oneTimePreKeys: string[];         // Vec<Base64>
}

/** Double Ratchet 消息头 */
export interface RatchetHeader {
  ratchetPublicKey: string;  // Base64
  counter: number;
  previousCounter: number;
  iv: string;                // Base64
}

/** Sender Key 消息头（群聊） */
export interface SenderKeyHeader {
  signingPubkey: string;  // Base64
  counter: number;
  signature: string;      // Base64
  iv: string;             // Base64
}

/** E2EE 消息（扩展 MessageDto） */
export interface E2eeMessage {
  id: string;
  sessionId: string;
  senderId: string;
  content: string;           // Base64 密文 或 明文
  encrypted: boolean;
  isGroup: boolean;
  deviceId?: string;
  header?: RatchetHeader;
  senderKeyHeader?: SenderKeyHeader;
  messageType: string;
  createdTime: string;
}

/** 加密协商请求 */
export interface E2eeNegotiationRequest {
  sessionId: string;
  identityKey?: string;
  signedPreKey?: string;
}

/** 私聊加密会话状态（本地） */
export interface E2eeSessionState {
  sessionId: string;
  status: E2eeSessionStatus;
  requesterId?: string;
}

/** 群聊加密状态 */
export interface E2eeGroupState {
  groupId: string;
  status: E2eeSessionStatus;
  enabledBy?: string;
}
