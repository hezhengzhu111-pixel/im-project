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
