import React from 'react';
import renderer from 'react-test-renderer';
import type { MobileMessage } from '@/types/models';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/app/theme', () => ({
  colors: { primary: '#0E7AFE', surface: '#FFFFFF', surfaceAlt: '#F5F5F5', text: '#1A1A1A', muted: '#999999', danger: '#E53E3E', border: '#E2E8F0', ai: '#6B46C1' },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { body: 14, tiny: 11, small: 12 },
}));

import { ImageBubble } from '../ImageBubble';

// ─── Helpers ────────────────────────────────────────────────────────

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  return '';
};

const msg = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'img-1',
  senderId: 'user-1',
  isGroupChat: false,
  messageType: 'IMAGE',
  content: '[Image]',
  mediaUrl: 'https://files.example.com/images/photo.jpg',
  mediaSize: 102400,
  mediaName: 'photo.jpg',
  thumbnailUrl: 'https://files.example.com/images/thumb_photo.jpg',
  sendTime: '2026-05-17T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('ImageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders image with correct source', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ImageBubble message={message} mine={false} />);
    });

    const imageNode = testRenderer!.root.find((node) => typeName(node) === 'Image');
    expect(imageNode.props.source).toEqual({ uri: 'https://files.example.com/images/photo.jpg' });
  });

  it('falls back to thumbnailUrl when mediaUrl is absent', () => {
    const message = msg({ mediaUrl: undefined, thumbnailUrl: 'https://files.example.com/images/thumb_only.jpg' });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ImageBubble message={message} mine={false} />);
    });

    const imageNode = testRenderer!.root.find((node) => typeName(node) === 'Image');
    expect(imageNode.props.source).toEqual({ uri: 'https://files.example.com/images/thumb_only.jpg' });
  });

  it('opens preview modal on press', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ImageBubble message={message} mine={false} />);
    });

    // Before press: MediaPreviewModal should not be visible
    const modalsBefore = testRenderer!.root.findAll(
      (node) => typeName(node) === 'MediaPreviewModal',
    );
    expect(modalsBefore.length).toBeGreaterThanOrEqual(1);
    expect(modalsBefore[0].props.visible).toBe(false);

    // Find the image Pressable and click it
    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable' && node.props.onPress != null,
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    // After press: MediaPreviewModal should be visible
    const modalsAfter = testRenderer!.root.findAll(
      (node) => typeName(node) === 'MediaPreviewModal',
    );
    const previewModal = modalsAfter.find((m) => m.props.mediaType === 'IMAGE');
    expect(previewModal).toBeDefined();
    expect(previewModal!.props.visible).toBe(true);
    expect(previewModal!.props.mediaUrl).toBe('https://files.example.com/images/photo.jpg');
  });

  it('closes preview modal on onClose', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ImageBubble message={message} mine={false} />);
    });

    // Open preview
    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable' && node.props.onPress != null,
    );
    renderer.act(() => {
      pressable.props.onPress();
    });

    // Find the preview modal and call onClose
    const modals = testRenderer!.root.findAll(
      (node) => typeName(node) === 'MediaPreviewModal',
    );
    const previewModal = modals.find((m) => m.props.mediaType === 'IMAGE')!;
    expect(previewModal.props.visible).toBe(true);

    renderer.act(() => {
      previewModal.props.onClose();
    });

    // After close: MediaPreviewModal should not be visible
    const modalsAfter = testRenderer!.root.findAll(
      (node) => typeName(node) === 'MediaPreviewModal',
    );
    const modalAfter = modalsAfter.find((m) => m.props.mediaType === 'IMAGE');
    expect(modalAfter!.props.visible).toBe(false);
  });
});
