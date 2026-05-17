import React from 'react';
import { Alert } from 'react-native';
import renderer from 'react-test-renderer';
import type { MobileMessage } from '@/types/models';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/app/theme', () => ({
  colors: { primary: '#0E7AFE', surface: '#FFFFFF', surfaceAlt: '#F5F5F5', text: '#1A1A1A', muted: '#999999', danger: '#E53E3E', border: '#E2E8F0', ai: '#6B46C1' },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { body: 14, tiny: 11, small: 12 },
}));

jest.mock('@/services/platform/linking', () => ({
  platformLinking: {
    openUrl: jest.fn(),
    openFile: jest.fn(),
  },
}));

import { platformLinking } from '@/services/platform/linking';
import { FileBubble } from '../FileBubble';

const mockOpenUrl = platformLinking.openUrl as jest.Mock;
const mockOpenFile = platformLinking.openFile as jest.Mock;

// ─── Helpers ────────────────────────────────────────────────────────

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  return '';
};

const msg = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'file-1',
  senderId: 'user-1',
  isGroupChat: false,
  messageType: 'FILE',
  content: '[File]',
  mediaUrl: 'https://files.example.com/docs/report.pdf',
  mediaSize: 2048000,
  mediaName: 'report.pdf',
  sendTime: '2026-05-17T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('FileBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenUrl.mockResolvedValue(undefined);
    mockOpenFile.mockResolvedValue(undefined);
  });

  it('displays file name', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const textNode = testRenderer!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('report.pdf'),
    );
    expect(textNode).toBeDefined();
  });

  it('displays file size formatted', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const textNode = testRenderer!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('MB'),
    );
    expect(textNode).toBeDefined();
  });

  it('calls openUrl for remote URL on press', () => {
    const message = msg({ mediaUrl: 'https://cdn.example.com/files/doc.pdf' });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    expect(mockOpenUrl).toHaveBeenCalledWith('https://cdn.example.com/files/doc.pdf');
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it('calls openFile for local file path on press', () => {
    const message = msg({ mediaUrl: '/data/local/file.pdf' });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    expect(mockOpenFile).toHaveBeenCalledWith('/data/local/file.pdf', undefined);
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it('strips file:// prefix before calling openFile', () => {
    const message = msg({ mediaUrl: 'file:///data/local/file.pdf' });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    expect(mockOpenFile).toHaveBeenCalledWith('/data/local/file.pdf', undefined);
  });

  it('passes mimeType from extra to openFile', () => {
    const message = msg({
      mediaUrl: '/data/local/file.pdf',
      extra: { mimeType: 'application/pdf' },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    expect(mockOpenFile).toHaveBeenCalledWith('/data/local/file.pdf', 'application/pdf');
  });

  it('shows Alert on open failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockOpenUrl.mockRejectedValue(new Error('network error'));

    const message = msg({ mediaUrl: 'https://cdn.example.com/files/broken.pdf' });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<FileBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    // Wait for async handlePress to complete
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        // The Alert should show the actual error message from the platform
        expect(alertSpy).toHaveBeenCalled();
        expect(alertSpy.mock.calls[0][0]).toBe('打开失败');
        alertSpy.mockRestore();
        resolve();
      });
    });
  });
});
