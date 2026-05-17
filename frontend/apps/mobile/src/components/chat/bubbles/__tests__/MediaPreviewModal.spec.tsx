import React from 'react';
import renderer from 'react-test-renderer';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/app/theme', () => ({
  colors: { primary: '#0E7AFE', surface: '#FFFFFF', surfaceAlt: '#F5F5F5', text: '#1A1A1A', muted: '#999999', danger: '#E53E3E', border: '#E2E8F0', ai: '#6B46C1' },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { body: 14, tiny: 11, small: 12 },
}));

import { MediaPreviewModal } from '../MediaPreviewModal';

// ─── Helpers ────────────────────────────────────────────────────────

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  return '';
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('MediaPreviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders image for IMAGE mediaType', () => {
    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(
        <MediaPreviewModal
          visible
          onClose={jest.fn()}
          mediaUrl="https://example.com/photo.jpg"
          mediaType="IMAGE"
        />,
      );
    });

    const imageNode = testRenderer!.root.find((node) => typeName(node) === 'Image');
    expect(imageNode.props.source).toEqual({ uri: 'https://example.com/photo.jpg' });
    expect(imageNode.props.resizeMode).toBe('contain');
  });

  it('renders Video for VIDEO mediaType', () => {
    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(
        <MediaPreviewModal
          visible
          onClose={jest.fn()}
          mediaUrl="https://example.com/video.mp4"
          mediaType="VIDEO"
        />,
      );
    });

    const videoNode = testRenderer!.root.find((node) => typeName(node) === 'Video');
    expect(videoNode.props.source).toEqual({ uri: 'https://example.com/video.mp4' });
  });

  it('renders close button', () => {
    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(
        <MediaPreviewModal
          visible
          onClose={jest.fn()}
          mediaUrl="https://example.com/photo.jpg"
          mediaType="IMAGE"
        />,
      );
    });

    const closeBtn = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable' && node.props.onPress != null,
    );
    expect(closeBtn).toBeDefined();
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(
        <MediaPreviewModal
          visible
          onClose={onClose}
          mediaUrl="https://example.com/photo.jpg"
          mediaType="IMAGE"
        />,
      );
    });

    const closeBtn = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable' && node.props.onPress != null,
    );

    renderer.act(() => {
      closeBtn.props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
