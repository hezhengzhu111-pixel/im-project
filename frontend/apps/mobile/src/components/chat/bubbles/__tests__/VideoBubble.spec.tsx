import React from 'react';
import renderer from 'react-test-renderer';
import type { MobileMessage } from '@/types/models';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/app/theme', () => ({
  colors: { primary: '#0E7AFE', surface: '#FFFFFF', surfaceAlt: '#F5F5F5', text: '#1A1A1A', muted: '#999999', danger: '#E53E3E', border: '#E2E8F0', ai: '#6B46C1' },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { body: 14, tiny: 11, small: 12 },
}));

import { VideoBubble } from '../VideoBubble';

// ─── Helpers ────────────────────────────────────────────────────────

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  return '';
};

const msg = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'vid-1',
  senderId: 'user-1',
  isGroupChat: false,
  messageType: 'VIDEO',
  content: '[Video]',
  mediaUrl: 'https://files.example.com/videos/clip.mp4',
  mediaSize: 5242880,
  mediaName: 'clip.mp4',
  thumbnailUrl: 'https://files.example.com/videos/thumb_clip.jpg',
  duration: 15,
  sendTime: '2026-05-17T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('VideoBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders thumbnail image', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VideoBubble message={message} mine={false} />);
    });

    const imageNode = testRenderer!.root.find((node) => typeName(node) === 'Image');
    expect(imageNode.props.source).toEqual({ uri: 'https://files.example.com/videos/thumb_clip.jpg' });
  });

  it('renders play overlay text', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VideoBubble message={message} mine={false} />);
    });

    const textNode = testRenderer!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('▶'),
    );
    expect(textNode).toBeDefined();
  });

  it('opens preview modal on press', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VideoBubble message={message} mine={false} />);
    });

    // Before press: MediaPreviewModal should not be visible
    const modalsBefore = testRenderer!.root.findAll((node) => typeName(node) === 'MediaPreviewModal');
    expect(modalsBefore.length).toBeGreaterThanOrEqual(1);
    expect(modalsBefore[0].props.visible).toBe(false);

    // Find the Pressable and click
    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable' && node.props.onPress != null,
    );
    renderer.act(() => {
      pressable.props.onPress();
    });

    // After press: MediaPreviewModal should be visible with VIDEO type
    const modalsAfter = testRenderer!.root.findAll((node) => typeName(node) === 'MediaPreviewModal');
    const previewModal = modalsAfter.find((m) => m.props.mediaType === 'VIDEO');
    expect(previewModal).toBeDefined();
    expect(previewModal!.props.visible).toBe(true);
    expect(previewModal!.props.mediaUrl).toBe('https://files.example.com/videos/clip.mp4');
  });

  it('renders placeholder when no thumbnail available', () => {
    const message = msg({ thumbnailUrl: undefined, mediaUrl: undefined });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VideoBubble message={message} mine={false} />);
    });

    // Should still render (no Image found)
    const images = testRenderer!.root.findAll((node) => typeName(node) === 'Image');
    expect(images.length).toBe(0);
  });
});
