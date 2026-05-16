/**
 * Mobile-side type boundary tests.
 *
 * Verifies that mobile platform extension types are compatible with shared-types
 * and that cross-platform contracts are maintained.
 */
import type {
  Message,
  MessageType,
  ChatSessionType,
} from '@im/shared-types';
import type { MobileMessage, PendingMessage, UploadTask } from '@/types/models';

// Endpoint constants from shared-api-contract
import { AUTH_ENDPOINTS } from '@im/shared-api-contract';
import { MESSAGE_ENDPOINTS } from '@im/shared-api-contract';
import { FILE_ENDPOINTS } from '@im/shared-api-contract';
import { USER_ENDPOINTS } from '@im/shared-api-contract';
import { FRIEND_ENDPOINTS } from '@im/shared-api-contract';
import { GROUP_ENDPOINTS } from '@im/shared-api-contract';
import { AI_ENDPOINTS } from '@im/shared-api-contract';
import { WS_MESSAGE_TYPE } from '@im/shared-api-contract';

describe('mobile type boundaries', () => {
  describe('MobileMessage must be safely convertible to shared Message', () => {
    it('MobileMessage extends Message (structural assignability)', () => {
      const mobile: MobileMessage = {
        id: '1',
        senderId: '1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
        status: 'SENT',
      };
      // MobileMessage must be assignable to Message
      const shared: Message = mobile;
      expect(shared.id).toBe('1');
      expect(shared.content).toBe('hello');
    });

    it('MobileMessage extra fields do not break Message conversion', () => {
      const mobile: MobileMessage = {
        id: '1',
        serverId: 'server_1',
        conversationId: 'conv_1',
        rawJson: '{}',
        senderId: '1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
        status: 'SENT',
      };
      const shared: Message = mobile;
      expect(shared.id).toBe('1');
    });

    it('serverId is optional on MobileMessage', () => {
      const mobile: MobileMessage = {
        id: '1',
        senderId: '1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
        status: 'SENT',
      };
      expect(mobile.serverId).toBeUndefined();
    });
  });

  describe('PendingMessage.sendType must be compatible with ChatSessionType', () => {
    it('PendingMessage accepts private sendType', () => {
      const pending: PendingMessage = {
        localId: 'local_1',
        conversationId: 'conv_1',
        sendType: 'private',
        payloadJson: '{}',
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const sessionType: ChatSessionType = pending.sendType;
      expect(sessionType).toBe('private');
    });

    it('PendingMessage accepts group sendType', () => {
      const pending: PendingMessage = {
        localId: 'local_1',
        conversationId: 'conv_1',
        sendType: 'group',
        payloadJson: '{}',
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const sessionType: ChatSessionType = pending.sendType;
      expect(sessionType).toBe('group');
    });

    it('PendingMessage.sendType is ChatSessionType (bidirectional)', () => {
      // Verify the types are exactly the same, not just compatible
      type Exact = PendingMessage['sendType'] extends ChatSessionType
        ? ChatSessionType extends PendingMessage['sendType']
          ? true
          : never
        : never;
      const check: Exact = true;
      expect(check).toBe(true);
    });
  });

  describe('UploadTask.uploadType must be MessageType', () => {
    it('UploadTask accepts valid MessageType values', () => {
      const task: UploadTask = {
        taskId: 'task_1',
        fileUri: 'file:///tmp/test.jpg',
        fileName: 'test.jpg',
        uploadType: 'IMAGE',
        status: 'pending',
        progress: 0,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const msgType: MessageType = task.uploadType;
      expect(msgType).toBe('IMAGE');
    });
  });

  describe('shared-api-contract endpoint constants are importable', () => {
    it('AUTH_ENDPOINTS is importable', () => {
      expect(AUTH_ENDPOINTS).toBeDefined();
    });

    it('MESSAGE_ENDPOINTS is importable', () => {
      expect(MESSAGE_ENDPOINTS).toBeDefined();
    });

    it('FILE_ENDPOINTS is importable', () => {
      expect(FILE_ENDPOINTS).toBeDefined();
    });

    it('USER_ENDPOINTS is importable', () => {
      expect(USER_ENDPOINTS).toBeDefined();
    });

    it('FRIEND_ENDPOINTS is importable', () => {
      expect(FRIEND_ENDPOINTS).toBeDefined();
    });

    it('GROUP_ENDPOINTS is importable', () => {
      expect(GROUP_ENDPOINTS).toBeDefined();
    });

    it('AI_ENDPOINTS is importable', () => {
      expect(AI_ENDPOINTS).toBeDefined();
    });

    it('WS_MESSAGE_TYPE is importable', () => {
      expect(WS_MESSAGE_TYPE).toBeDefined();
    });
  });
});
