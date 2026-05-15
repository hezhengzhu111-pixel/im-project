/**
 * Shared-types compile-time boundary tests.
 *
 * These assertions are verified by `tsc --noEmit`. They enforce cross-platform
 * type contracts without requiring a test runner.
 */
import type {
  Message,
  MessageType,
  MessageStatus,
  ChatSession,
  ChatSessionType,
  User,
  FriendRequest,
  Group,
  GroupMember,
  UserAuthResponse,
  ApiResponse,
  WebSocketMessage,
} from '../index.js';

// ── 1. MessageType must include AI_REPLY ─────────────────────────────
type _AiReplyIncluded = MessageType extends infer T
  ? 'AI_REPLY' extends T
    ? true
    : never
  : never;
const _assertAiReply: _AiReplyIncluded = true;

// ── 2. MessageStatus must include RECALLED and DELETED ───────────────
type _RecalledIncluded = 'RECALLED' extends MessageStatus ? true : never;
type _DeletedIncluded = 'DELETED' extends MessageStatus ? true : never;
const _assertRecalled: _RecalledIncluded = true;
const _assertDeleted: _DeletedIncluded = true;

// ── 3. ChatSessionType must be 'private' | 'group' ──────────────────
type _SessionTypeExact = ChatSessionType extends 'private' | 'group'
  ? 'private' | 'group' extends ChatSessionType
    ? true
    : never
  : never;
const _assertSessionType: _SessionTypeExact = true;

// ── 4. Message must NOT have serverId ────────────────────────────────
type _NoServerId = 'serverId' extends keyof Message ? never : true;
const _assertNoServerId: _NoServerId = true;

// ── 5. User must NOT have region ─────────────────────────────────────
type _NoRegion = 'region' extends keyof User ? never : true;
const _assertNoRegion: _NoRegion = true;

// ── 6. Message must have isAiGenerated ───────────────────────────────
type _HasAiFlag = 'isAiGenerated' extends keyof Message ? true : never;
const _assertHasAiFlag: _HasAiFlag = true;

// ── 7. ChatSession must have type: ChatSessionType ───────────────────
type _SessionHasType = ChatSession['type'] extends ChatSessionType ? true : never;
const _assertSessionHasType: _SessionHasType = true;

// ── 8. ApiResponse is generic ────────────────────────────────────────
type _ApiGeneric = ApiResponse<string> extends { data: string } ? true : never;
const _assertApiGeneric: _ApiGeneric = true;

// ── 9. WebSocketMessage type union is exhaustive ─────────────────────
type _WsTypes = WebSocketMessage['type'];
type _WsHasMessage = 'MESSAGE' extends _WsTypes ? true : never;
type _WsHasHeartbeat = 'HEARTBEAT' extends _WsTypes ? true : never;
const _assertWsMessage: _WsHasMessage = true;
const _assertWsHeartbeat: _WsHasHeartbeat = true;

// ── 10. FriendRequest must have status field ─────────────────────────
type _FRHasStatus = 'status' extends keyof FriendRequest ? true : never;
const _assertFRHasStatus: _FRHasStatus = true;

// ── E2EE type boundaries (E9, E10, E11, E24, E29, E32, E33) ─────────

// 11. Message must have encrypted field (E29.1)
type _HasEncrypted = 'encrypted' extends keyof Message ? true : never;
const _assertHasEncrypted: _HasEncrypted = true;

// 12. Message must have e2eeHeader (E29.1)
type _HasE2eeHeader = 'e2eeHeader' extends keyof Message ? true : never;
const _assertHasE2eeHeader: _HasE2eeHeader = true;

// 13. Message must have e2eeDeviceId (E29.1)
type _HasE2eeDeviceId = 'e2eeDeviceId' extends keyof Message ? true : never;
const _assertHasE2eeDeviceId: _HasE2eeDeviceId = true;

// 14. Message must have e2eeSenderIdentityKey (E29.1)
type _HasE2eeSenderIdentityKey = 'e2eeSenderIdentityKey' extends keyof Message ? true : never;
const _assertHasE2eeSenderIdentityKey: _HasE2eeSenderIdentityKey = true;

// 15. Message must have e2eeEphemeralKey (E29.1)
type _HasE2eeEphemeralKey = 'e2eeEphemeralKey' extends keyof Message ? true : never;
const _assertHasE2eeEphemeralKey: _HasE2eeEphemeralKey = true;

// 16. ChatSession must have encrypted field (E9.5, E29.2)
type _SessionHasEncrypted = 'encrypted' extends keyof ChatSession ? true : never;
const _assertSessionHasEncrypted: _SessionHasEncrypted = true;

// 17. WebSocketMessage type must include E2EE_NEGOTIATION (E11.1, E29.3)
type _WsHasNegotiation = 'E2EE_NEGOTIATION' extends WebSocketMessage['type'] ? true : never;
const _assertWsHasNegotiation: _WsHasNegotiation = true;

// 18. Message must NOT have private key fields (E29.4, E32.5)
type _NoIdentityPrivateKey = 'identityPrivateKey' extends keyof Message ? never : true;
const _assertNoIdentityPrivateKey: _NoIdentityPrivateKey = true;
type _NoRootKey = 'rootKey' extends keyof Message ? never : true;
const _assertNoRootKey: _NoRootKey = true;
type _NoChainKey = 'chainKey' extends keyof Message ? never : true;
const _assertNoChainKey: _NoChainKey = true;
type _NoRatchetState = 'ratchetState' extends keyof Message ? never : true;
const _assertNoRatchetState: _NoRatchetState = true;
type _NoMediaKey = 'mediaKey' extends keyof Message ? never : true;
const _assertNoMediaKey: _NoMediaKey = true;

// 19. ChatSession must NOT have private key fields (E29.4, E32.5)
type _SessionNoIdentityPrivateKey = 'identityPrivateKey' extends keyof ChatSession ? never : true;
const _assertSessionNoIdentityPrivateKey: _SessionNoIdentityPrivateKey = true;
type _SessionNoRatchetState = 'ratchetState' extends keyof ChatSession ? never : true;
const _assertSessionNoRatchetState: _SessionNoRatchetState = true;

// 20. encrypted field on Message accepts boolean | number (E29.1, E22.1)
const _encryptedBool: Message['encrypted'] = true;
const _encryptedNum: Message['encrypted'] = 1;
const _encryptedUndef: Message['encrypted'] = undefined;

// 21. ChatSession.encrypted is boolean (E9.5, E29.2)
const _sessionEncrypted: NonNullable<ChatSession['encrypted']> = true;

// Silence unused variable warnings
void _assertAiReply;
void _assertRecalled;
void _assertDeleted;
void _assertSessionType;
void _assertNoServerId;
void _assertNoRegion;
void _assertHasAiFlag;
void _assertSessionHasType;
void _assertApiGeneric;
void _assertWsMessage;
void _assertWsHeartbeat;
void _assertFRHasStatus;
void _assertHasEncrypted;
void _assertHasE2eeHeader;
void _assertHasE2eeDeviceId;
void _assertHasE2eeSenderIdentityKey;
void _assertHasE2eeEphemeralKey;
void _assertSessionHasEncrypted;
void _assertWsHasNegotiation;
void _assertNoIdentityPrivateKey;
void _assertNoRootKey;
void _assertNoChainKey;
void _assertNoRatchetState;
void _assertNoMediaKey;
void _assertSessionNoIdentityPrivateKey;
void _assertSessionNoRatchetState;
void _encryptedBool;
void _encryptedNum;
void _encryptedUndef;
void _sessionEncrypted;
