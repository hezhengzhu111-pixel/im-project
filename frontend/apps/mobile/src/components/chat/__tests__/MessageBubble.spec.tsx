/**
 * MessageBubble Phase 4 status display tests.
 *
 * Verifies that the component shows correct send/upload states
 * derived from pendingMessageRepository + uploadTaskRepository.
 */

import React from 'react';
import renderer from 'react-test-renderer';
import type { MobileMessage, PendingMessage, UploadTask } from '@/types/models';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/storage/uploadTaskRepository');
jest.mock('@/services/media/mediaService');
jest.mock('@/services/platform/linking');
jest.mock('@/e2ee/E2eeUnsupportedMessage', () => ({
  E2eeUnsupportedMessage: () => {
    const RN = require('react-native') as typeof import('react-native');
    const R = require('react') as typeof import('react');
    return R.createElement(RN.View, null, R.createElement(RN.Text, null, '[E2EE unsupported]'));
  },
}));

jest.mock('@/e2ee/e2eeDeferred', () => ({
  isEncryptedMessage: jest.fn((message: MobileMessage) => {
    const record = message as unknown as Record<string, unknown>;
    return !!record.encrypted;
  }),
}));

jest.mock('@/app/theme', () => ({
  colors: {
    primary: '#0E7AFE',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F5F5',
    text: '#1A1A1A',
    muted: '#999999',
    danger: '#E53E3E',
    border: '#E2E8F0',
    ai: '#6B46C1',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { body: 14, tiny: 11, small: 12 },
}));

const mockGetPending = jest.fn();
const mockFindUploadByMsgId = jest.fn();

// ─── Imports after mocks ────────────────────────────────────────────

import { MessageBubble } from '../MessageBubble';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { isEncryptedMessage } from '@/e2ee/e2eeDeferred';

jest.mocked(pendingMessageRepository).get = mockGetPending;
jest.mocked(uploadTaskRepository).findByLocalMessageId = mockFindUploadByMsgId;

// ─── Helpers ────────────────────────────────────────────────────────

function msg(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: 'msg-1',
    senderId: 'user-1',
    isGroupChat: false,
    messageType: 'TEXT',
    content: 'hello',
    sendTime: '2026-05-16T00:00:00Z',
    status: 'SENT',
    ...overrides,
  };
}

function pending(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    localId: 'msg-1',
    conversationId: 'conv-1',
    sendType: 'private',
    payloadJson: '{}',
    status: 'pending',
    retryCount: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function upload(overrides: Partial<UploadTask> = {}): UploadTask {
  return {
    taskId: 'up-1',
    localMessageId: 'msg-1',
    fileUri: 'file:///tmp/a.jpg',
    fileName: 'a.jpg',
    uploadType: 'IMAGE',
    status: 'pending',
    progress: 0,
    retryCount: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || node.type.name || '';
  return '';
};

const findTextContent = (root: renderer.ReactTestInstance, text: string): boolean => {
  try {
    root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes(text),
    );
    return true;
  } catch {
    return false;
  }
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('MessageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPending.mockReturnValue(undefined);
    mockFindUploadByMsgId.mockReturnValue(undefined);
    (isEncryptedMessage as jest.Mock).mockReturnValue(false);
  });

  // ── 1. SENT message shows no error state ──────────────────────────

  describe('normal sent message', () => {
    it('does not show error or sending state', () => {
      const message = msg({ status: 'SENT' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Failed')).toBe(false);
      expect(findTextContent(testRenderer!.root, 'Sending')).toBe(false);
    });
  });

  // ── 2. SENDING / SEND_PENDING message shows "Sending..." ─────────

  describe('sending state', () => {
    it('shows Sending... when message is SENDING and no pending row', () => {
      const message = msg({ status: 'SENDING' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Sending')).toBe(true);
    });

    it('shows Sending... when pending.status is sending', () => {
      const message = msg({ status: 'SENDING' });
      mockGetPending.mockReturnValue(pending({ status: 'sending' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Sending')).toBe(true);
    });

    it('shows Sending... when pending.status is pending (SEND_PENDING stage)', () => {
      const message = msg({ status: 'SENDING' });
      mockGetPending.mockReturnValue(pending({ status: 'pending' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Sending')).toBe(true);
    });

    it('continues polling to refresh SEND_PENDING → SENT', () => {
      jest.useFakeTimers();
      const message = msg({ status: 'SENDING' });
      mockGetPending.mockReturnValue(pending({ status: 'pending' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Sending')).toBe(true);

      // Simulate send completion: pending removed, message status becomes SENT
      mockGetPending.mockReturnValue(undefined);
      const sentMessage = msg({ status: 'SENT' });

      renderer.act(() => {
        testRenderer.update(
          <MessageBubble message={sentMessage} mine={true} />,
        );
        jest.advanceTimersByTime(600);
      });

      // Should no longer show Sending
      expect(findTextContent(testRenderer!.root, 'Sending')).toBe(false);

      renderer.act(() => {
        testRenderer!.unmount();
      });
      jest.useRealTimers();
    });
  });

  // ── 3. UPLOADING shows upload progress ────────────────────────────

  describe('uploading state', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows Uploading 45% when upload is in progress', () => {
      const message = msg({ status: 'SENDING', messageType: 'IMAGE' });
      mockGetPending.mockReturnValue(pending({ status: 'sending' }));
      mockFindUploadByMsgId.mockReturnValue(upload({ status: 'uploading', progress: 45 }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Uploading 45%')).toBe(true);

      // Cleanup: unmount to stop polling interval
      renderer.act(() => {
        testRenderer!.unmount();
      });
    });

    it('shows Preparing upload... when upload is pending', () => {
      const message = msg({ status: 'SENDING', messageType: 'IMAGE' });
      mockGetPending.mockReturnValue(pending({ status: 'sending' }));
      mockFindUploadByMsgId.mockReturnValue(upload({ status: 'pending', progress: 0 }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Preparing upload')).toBe(true);

      renderer.act(() => {
        testRenderer!.unmount();
      });
    });

    it('continues polling to refresh status during UPLOAD_PENDING stage', () => {
      const message = msg({ status: 'SENDING', messageType: 'IMAGE' });
      mockGetPending.mockReturnValue(pending({ status: 'sending' }));
      // Start with UPLOAD_PENDING
      mockFindUploadByMsgId.mockReturnValue(upload({ status: 'pending', progress: 0 }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Preparing upload')).toBe(true);

      // Transition to UPLOADING after polling
      mockFindUploadByMsgId.mockReturnValue(upload({ status: 'uploading', progress: 25 }));

      renderer.act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(findTextContent(testRenderer!.root, 'Uploading 25%')).toBe(true);

      renderer.act(() => {
        testRenderer!.unmount();
      });
    });

    it('reflects updated progress on re-render', () => {
      const message = msg({ status: 'SENDING', messageType: 'IMAGE' });
      mockGetPending.mockReturnValue(pending({ status: 'sending' }));
      mockFindUploadByMsgId.mockReturnValue(upload({ status: 'uploading', progress: 30 }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Uploading 30%')).toBe(true);

      // Update progress
      mockFindUploadByMsgId.mockReturnValue(upload({ status: 'uploading', progress: 80 }));
      renderer.act(() => {
        testRenderer.update(
          <MessageBubble message={{ ...message }} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Uploading 80%')).toBe(true);

      renderer.act(() => {
        testRenderer!.unmount();
      });
    });
  });

  // ── 4. FAILED shows Retry ─────────────────────────────────────────

  describe('failed state', () => {
    it('shows error text when SEND_FAILED with localError', () => {
      const message = msg({ status: 'FAILED' });
      mockGetPending.mockReturnValue(pending({ status: 'failed', lastError: 'send failed: network error' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'send failed: network error')).toBe(true);
    });

    it('shows default retry text when no localError', () => {
      const message = msg({ status: 'FAILED' });
      mockGetPending.mockReturnValue(pending({ status: 'failed' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Failed. Tap to retry.')).toBe(true);
    });

    it('shows upload error when UPLOAD_FAILED', () => {
      const message = msg({ status: 'FAILED', messageType: 'IMAGE' });
      mockFindUploadByMsgId.mockReturnValue(
        upload({ status: 'failed', lastError: 'upload timeout' }),
      );

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'upload timeout')).toBe(true);
    });

    it('calls onRetry when failed text is pressed', () => {
      const onRetry = jest.fn();
      const message = msg({ status: 'FAILED' });
      mockGetPending.mockReturnValue(pending({ status: 'failed' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} onRetry={onRetry} />,
        );
      });

      // Find the retry Pressable (the one whose children contain "Failed")
      const retryButton = testRenderer!.root.find(
        (node) =>
          node.props.onPress != null &&
          typeName(node) === 'Pressable' &&
          findTextContent(node, 'Failed'),
      );

      renderer.act(() => {
        retryButton.props.onPress();
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. BLOCKED state ──────────────────────────────────────────────

  describe('blocked state', () => {
    it('shows Blocked when pending is blocked', () => {
      const message = msg({ status: 'FAILED' });
      mockGetPending.mockReturnValue(pending({ status: 'blocked' }));

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Blocked')).toBe(true);
    });
  });

  // ── 6. E2EE encrypted message ─────────────────────────────────────

  describe('E2EE encrypted message', () => {
    it('shows E2eeUnsupportedMessage when encrypted', () => {
      (isEncryptedMessage as jest.Mock).mockReturnValue(true);
      const message = msg({ encrypted: true } as MobileMessage);

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={false} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'E2EE unsupported')).toBe(true);
    });
  });

  // ── 7. Group message shows sender name ────────────────────────────

  describe('group message sender', () => {
    it('shows sender name for group messages not from self', () => {
      const message = msg({
        groupId: 'group-1',
        senderName: 'Alice',
        senderId: 'user-2',
        status: 'SENT',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={false} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Alice')).toBe(true);
    });

    it('does not show sender name for own messages', () => {
      const message = msg({
        groupId: 'group-1',
        senderName: 'Me',
        senderId: 'user-1',
        status: 'SENT',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} />,
        );
      });

      expect(findTextContent(testRenderer!.root, 'Me')).toBe(false);
    });
  });
});
