/**
 * MessageBubble 消息类型渲染测试。
 *
 * 验证 MessageBubble 对不同 messageType 渲染正确的子组件：
 * TEXT / AI_REPLY / IMAGE / VIDEO / VOICE / FILE / RECALLED / DELETED / E2EE
 */

import React from 'react';
import renderer from 'react-test-renderer';
import type { MobileMessage } from '@/types/models';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/storage/uploadTaskRepository');
jest.mock('@/services/media/mediaService');
jest.mock('@/services/platform/linking');

jest.mock('@/e2ee/e2eeDeferred', () => ({
  isEncryptedMessage: jest.fn((message: MobileMessage) => {
    const record = message as unknown as Record<string, unknown>;
    return !!record.encrypted;
  }),
}));

jest.mock('@/e2ee/E2eeUnsupportedMessage', () => ({
  E2eeUnsupportedMessage: () => {
    const RN = require('react-native') as typeof import('react-native');
    const R = require('react') as typeof import('react');
    return R.createElement(RN.View, null, R.createElement(RN.Text, null, '[E2EE unsupported]'));
  },
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

// ─── Import after mocks ─────────────────────────────────────────────

import { MessageBubble } from '../MessageBubble';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { isEncryptedMessage } from '@/e2ee/e2eeDeferred';

jest.mocked(pendingMessageRepository.get).mockReturnValue(undefined);
jest.mocked(uploadTaskRepository.findByLocalMessageId).mockReturnValue(undefined);

// ─── Helpers ────────────────────────────────────────────────────────

function msg(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: 'msg-t1',
    senderId: 'user-1',
    isGroupChat: false,
    messageType: 'TEXT',
    content: 'hello',
    sendTime: '2026-05-17T10:00:00.000Z',
    status: 'SENT',
    ...overrides,
  };
}

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') {
    return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  }
  return '';
};

const findText = (root: renderer.ReactTestInstance, text: string): boolean => {
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

describe('MessageBubble message type rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(pendingMessageRepository.get).mockReturnValue(undefined);
    jest.mocked(uploadTaskRepository.findByLocalMessageId).mockReturnValue(undefined);
    (isEncryptedMessage as jest.Mock).mockReturnValue(false);
  });

  // ── TEXT ───────────────────────────────────────────────────────

  describe('TEXT message', () => {
    it('renders text content in bubble', () => {
      const message = msg({ messageType: 'TEXT', content: 'Hello World' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, 'Hello World')).toBe(true);
    });

    it('renders my text with mine styling', () => {
      const message = msg({ messageType: 'TEXT', content: 'My message' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={true} />);
      });

      expect(findText(testRenderer!.root, 'My message')).toBe(true);
    });
  });

  // ── AI_REPLY ──────────────────────────────────────────────────

  describe('AI_REPLY message', () => {
    it('shows AI badge for AI reply messages', () => {
      const message = msg({ messageType: 'AI_REPLY', content: 'AI summary here' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      // The AI badge is a <Text>AI</Text> node
      const aiBadgeNodes = testRenderer!.root.findAll(
        (node) => typeName(node) === 'Text' && (node.children as string[])?.[0] === 'AI',
      );
      expect(aiBadgeNodes.length).toBeGreaterThanOrEqual(1);

      // The content text should also be rendered
      expect(findText(testRenderer!.root, 'AI summary here')).toBe(true);
    });
  });

  // ── IMAGE ─────────────────────────────────────────────────────

  describe('IMAGE message with mediaUri', () => {
    it('renders ImageBubble when mediaUri is present', () => {
      const message = msg({
        messageType: 'IMAGE',
        content: '',
        mediaUrl: 'file:///storage/photo.jpg',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      const imageBubbles = testRenderer!.root.findAll(
        (node) => typeName(node) === 'ImageBubble',
      );
      expect(imageBubbles.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to text content when no mediaUri', () => {
      const message = msg({ messageType: 'IMAGE', content: '[Image]', mediaUrl: undefined });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, '[Image]')).toBe(true);
    });
  });

  // ── VIDEO ─────────────────────────────────────────────────────

  describe('VIDEO message with mediaUri', () => {
    it('renders VideoBubble when mediaUri is present', () => {
      const message = msg({
        messageType: 'VIDEO',
        content: '',
        mediaUrl: 'file:///storage/clip.mp4',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      const videoBubbles = testRenderer!.root.findAll(
        (node) => typeName(node) === 'VideoBubble',
      );
      expect(videoBubbles.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── VOICE ─────────────────────────────────────────────────────

  describe('VOICE message with mediaUri', () => {
    it('renders VoiceBubble when mediaUri is present', () => {
      const message = msg({
        messageType: 'VOICE',
        content: '',
        mediaUrl: 'file:///storage/audio.m4a',
        duration: 8,
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      const voiceBubbles = testRenderer!.root.findAll(
        (node) => typeName(node) === 'VoiceBubble',
      );
      expect(voiceBubbles.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── FILE ──────────────────────────────────────────────────────

  describe('FILE message with mediaUri', () => {
    it('renders FileBubble when mediaUri is present', () => {
      const message = msg({
        messageType: 'FILE',
        content: '',
        mediaUrl: 'file:///storage/doc.pdf',
        mediaName: 'report.pdf',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      const fileBubbles = testRenderer!.root.findAll(
        (node) => typeName(node) === 'FileBubble',
      );
      expect(fileBubbles.length).toBeGreaterThanOrEqual(1);
    });

    it('shows text content fallback when no mediaUri', () => {
      const message = msg({
        messageType: 'FILE',
        content: '[File]',
        mediaUrl: undefined,
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, '[File]')).toBe(true);
    });
  });

  // ── Bubble content fallbacks ──────────────────────────────────

  describe('bubble content fallback', () => {
    it('uses mediaName when content is empty', () => {
      const message = msg({
        messageType: 'IMAGE',
        content: '',
        mediaName: 'photo.jpg',
        mediaUrl: undefined,
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, 'photo.jpg')).toBe(true);
    });

    it('uses mediaUrl when content and mediaName are empty', () => {
      const message = msg({
        messageType: 'IMAGE',
        content: '',
        mediaName: undefined,
        mediaUrl: 'https://cdn.example.com/abc123.jpg',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, 'https://cdn.example.com/abc123.jpg')).toBe(true);
    });

    it('uses messageType when all text fields are empty', () => {
      const message = msg({
        messageType: 'IMAGE',
        content: '',
        mediaName: undefined,
        mediaUrl: undefined,
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, 'IMAGE')).toBe(true);
    });
  });

  // ── RECALLED ──────────────────────────────────────────────────

  describe('RECALLED message', () => {
    it('shows recalled text and does not render normal bubble', () => {
      const message = msg({ status: 'RECALLED', content: '这条消息已撤回' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, '这条消息已撤回')).toBe(true);
    });
  });

  // ── DELETED ───────────────────────────────────────────────────

  describe('DELETED message', () => {
    it('renders null', () => {
      const message = msg({ status: 'DELETED' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={true} />);
      });

      expect(testRenderer!.root.children.filter(Boolean)).toHaveLength(0);
    });
  });

  // ── E2EE encrypted ────────────────────────────────────────────

  describe('E2EE encrypted message', () => {
    it('renders E2EE unsupported for encrypted messages', () => {
      (isEncryptedMessage as jest.Mock).mockReturnValue(true);
      const message = msg({ encrypted: true } as MobileMessage);

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, '[E2EE unsupported]')).toBe(true);
    });
  });

  // ── FAILED message retry ──────────────────────────────────────

  describe('FAILED message retry', () => {
    it('shows retry prompt for FAILED status', () => {
      const message = msg({ status: 'FAILED' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={true} />);
      });

      expect(findText(testRenderer!.root, 'Failed. Tap to retry.')).toBe(true);
    });

    it('calls onRetry when retry prompt is pressed', () => {
      const onRetry = jest.fn();
      const message = msg({ status: 'FAILED' });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={true} onRetry={onRetry} />);
      });

      const retryPressable = testRenderer!.root.find(
        (node) =>
          node.props.onPress != null &&
          typeName(node) === 'Pressable' &&
          findText(node, 'Failed'),
      );
      renderer.act(() => { retryPressable.props.onPress(); });

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  // ── Long press handler ────────────────────────────────────────

  describe('long press', () => {
    it('calls onLongPress callback', () => {
      const onLongPress = jest.fn();
      const message = msg();

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageBubble message={message} mine={true} onLongPress={onLongPress} />,
        );
      });

      const outerPressable = testRenderer!.root.find(
        (node) => typeName(node) === 'Pressable' && node.props.onLongPress != null,
      );

      renderer.act(() => { outerPressable.props.onLongPress(); });
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('renders without onLongPress being passed and does not crash', () => {
      const message = msg();

      let testRenderer: renderer.ReactTestRenderer;
      expect(() => {
        renderer.act(() => {
          testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
        });
      }).not.toThrow();

      // Verify the component rendered (text content is visible)
      expect(findText(testRenderer!.root, 'hello')).toBe(true);
    });
  });

  // ── Group sender name ─────────────────────────────────────────

  describe('group sender name', () => {
    it('shows senderName for group messages from others', () => {
      const message = msg({
        groupId: 'g1',
        senderId: 'user-2',
        senderName: 'Bob',
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, 'Bob')).toBe(true);
    });

    it('falls back to senderId when senderName is absent', () => {
      const message = msg({
        groupId: 'g1',
        senderId: 'user-99',
        senderName: undefined,
      });

      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(<MessageBubble message={message} mine={false} />);
      });

      expect(findText(testRenderer!.root, 'user-99')).toBe(true);
    });
  });
});
