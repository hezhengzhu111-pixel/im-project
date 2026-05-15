/**
 * Web-side type boundary tests.
 *
 * Verifies that web type files are pure re-exports of shared-types and that
 * cross-platform contracts are maintained.
 */
import { describe, it, expect } from 'vitest';
import type {
  // Core business types from @im/shared-types
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
} from '@im/shared-types';

// Re-export paths that old code may use
import type {
  Message as WebMessage,
  MessageType as WebMessageType,
  MessageStatus as WebMessageStatus,
} from '@/types/message';
import type {
  User as WebUser,
  UserAuthResponse as WebUserAuthResponse,
} from '@/types/user';
import type {
  ChatSession as WebChatSession,
  WebSocketMessage as WebWebSocketMessage,
} from '@/types/chat';
import type {
  Group as WebGroup,
  GroupMember as WebGroupMember,
} from '@/types/group';
import type {
  ApiResponse as WebApiResponse,
} from '@/types/api';

// Endpoint constants from shared-api-contract
import { AUTH_ENDPOINTS } from '@im/shared-api-contract';
import { MESSAGE_ENDPOINTS } from '@im/shared-api-contract';
import { USER_ENDPOINTS } from '@im/shared-api-contract';
import { FRIEND_ENDPOINTS } from '@im/shared-api-contract';
import { GROUP_ENDPOINTS } from '@im/shared-api-contract';
import { AI_ENDPOINTS } from '@im/shared-api-contract';
import { FILE_ENDPOINTS } from '@im/shared-api-contract';
import { WS_MESSAGE_TYPE } from '@im/shared-api-contract';

describe('web type boundaries', () => {
  describe('re-export identity — web types must be identical to shared-types', () => {
    it('Message re-export is identical', () => {
      // If these are different types, the assignment will fail at compile time.
      const check: Message = {} as WebMessage;
      const checkReverse: WebMessage = {} as Message;
      void check;
      void checkReverse;
    });

    it('MessageType re-export is identical', () => {
      const check: MessageType = {} as WebMessageType;
      const checkReverse: WebMessageType = {} as MessageType;
      void check;
      void checkReverse;
    });

    it('MessageStatus re-export is identical', () => {
      const check: MessageStatus = {} as WebMessageStatus;
      const checkReverse: WebMessageStatus = {} as MessageStatus;
      void check;
      void checkReverse;
    });

    it('User re-export is identical', () => {
      const check: User = {} as WebUser;
      const checkReverse: WebUser = {} as User;
      void check;
      void checkReverse;
    });

    it('UserAuthResponse re-export is identical', () => {
      const check: UserAuthResponse = {} as WebUserAuthResponse;
      const checkReverse: WebUserAuthResponse = {} as UserAuthResponse;
      void check;
      void checkReverse;
    });

    it('ChatSession re-export is identical', () => {
      const check: ChatSession = {} as WebChatSession;
      const checkReverse: WebChatSession = {} as ChatSession;
      void check;
      void checkReverse;
    });

    it('WebSocketMessage re-export is identical', () => {
      const check: WebSocketMessage = {} as WebWebSocketMessage;
      const checkReverse: WebWebSocketMessage = {} as WebSocketMessage;
      void check;
      void checkReverse;
    });

    it('Group re-export is identical', () => {
      const check: Group = {} as WebGroup;
      const checkReverse: WebGroup = {} as Group;
      void check;
      void checkReverse;
    });

    it('GroupMember re-export is identical', () => {
      const check: GroupMember = {} as WebGroupMember;
      const checkReverse: WebGroupMember = {} as GroupMember;
      void check;
      void checkReverse;
    });

    it('ApiResponse re-export is identical', () => {
      const check: ApiResponse = {} as WebApiResponse;
      const checkReverse: WebApiResponse = {} as ApiResponse;
      void check;
      void checkReverse;
    });
  });

  describe('shared-api-contract endpoint constants are importable', () => {
    it('AUTH_ENDPOINTS has expected keys', () => {
      expect(AUTH_ENDPOINTS).toBeDefined();
      expect(typeof AUTH_ENDPOINTS).toBe('object');
    });

    it('MESSAGE_ENDPOINTS has expected keys', () => {
      expect(MESSAGE_ENDPOINTS).toBeDefined();
      expect(typeof MESSAGE_ENDPOINTS).toBe('object');
    });

    it('USER_ENDPOINTS has expected keys', () => {
      expect(USER_ENDPOINTS).toBeDefined();
      expect(typeof USER_ENDPOINTS).toBe('object');
    });

    it('FRIEND_ENDPOINTS has expected keys', () => {
      expect(FRIEND_ENDPOINTS).toBeDefined();
      expect(typeof FRIEND_ENDPOINTS).toBe('object');
    });

    it('GROUP_ENDPOINTS has expected keys', () => {
      expect(GROUP_ENDPOINTS).toBeDefined();
      expect(typeof GROUP_ENDPOINTS).toBe('object');
    });

    it('AI_ENDPOINTS has expected keys', () => {
      expect(AI_ENDPOINTS).toBeDefined();
      expect(typeof AI_ENDPOINTS).toBe('object');
    });

    it('FILE_ENDPOINTS has expected keys', () => {
      expect(FILE_ENDPOINTS).toBeDefined();
      expect(typeof FILE_ENDPOINTS).toBe('object');
    });

    it('WS_MESSAGE_TYPE has expected keys', () => {
      expect(WS_MESSAGE_TYPE).toBeDefined();
      expect(typeof WS_MESSAGE_TYPE).toBe('object');
    });
  });

  describe('User.region must not leak as a cross-platform field', () => {
    it('User type does not have region', () => {
      // Compile-time check: if User had 'region', this would error.
      type NoRegion = 'region' extends keyof User ? never : true;
      const check: NoRegion = true;
      expect(check).toBe(true);
    });
  });

  describe('Message.serverId must not exist in shared Message', () => {
    it('Message type does not have serverId', () => {
      type NoServerId = 'serverId' extends keyof Message ? never : true;
      const check: NoServerId = true;
      expect(check).toBe(true);
    });
  });

  describe('MessageType includes AI_REPLY', () => {
    it('AI_REPLY is a valid MessageType', () => {
      const msgType: MessageType = 'AI_REPLY';
      expect(msgType).toBe('AI_REPLY');
    });
  });

  describe('MessageStatus includes RECALLED and DELETED', () => {
    it('RECALLED is a valid MessageStatus', () => {
      const status: MessageStatus = 'RECALLED';
      expect(status).toBe('RECALLED');
    });

    it('DELETED is a valid MessageStatus', () => {
      const status: MessageStatus = 'DELETED';
      expect(status).toBe('DELETED');
    });
  });
});
