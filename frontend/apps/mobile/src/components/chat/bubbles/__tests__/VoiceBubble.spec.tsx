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

jest.mock('@/services/media/mediaService', () => ({
  mediaService: {
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
  },
}));

import { mediaService } from '@/services/media/mediaService';
import { VoiceBubble } from '../VoiceBubble';

const mockPlayAudio = mediaService.playAudio as jest.Mock;
const mockStopAudio = mediaService.stopAudio as jest.Mock;

// ─── Helpers ────────────────────────────────────────────────────────

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  return '';
};

const msg = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'voice-1',
  senderId: 'user-1',
  isGroupChat: false,
  messageType: 'VOICE',
  content: '[Voice]',
  mediaUrl: 'https://files.example.com/audio/msg.m4a',
  mediaSize: 48000,
  mediaName: 'msg.m4a',
  duration: 8,
  sendTime: '2026-05-17T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

const findPressable = (tree: renderer.ReactTestRenderer) =>
  tree.root.find((node) => typeName(node) === 'Pressable');

const findLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes(label),
  );

// ─── Tests ──────────────────────────────────────────────────────────

describe('VoiceBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayAudio.mockReturnValue(undefined);
    mockStopAudio.mockReturnValue(undefined);
  });

  it('calls playAudio on press when not playing', () => {
    const message = msg();

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith('https://files.example.com/audio/msg.m4a');
    expect(mockStopAudio).not.toHaveBeenCalled();
  });

  it('shows stop label after successful play', () => {
    const message = msg();

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    expect(findLabel(tree!, '播放语音')).toBeDefined();

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(findLabel(tree!, '停止')).toBeDefined();
  });

  it('calls stopAudio on press when currently playing', () => {
    const message = msg();

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    // First press: play
    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    // Second press: stop
    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(mockStopAudio).toHaveBeenCalled();
    expect(mockPlayAudio).toHaveBeenCalledTimes(1);
  });

  it('shows Alert on play failure', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPlayAudio.mockImplementation(() => {
      throw new Error('audio codec error');
    });

    const message = msg();

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('播放失败', 'audio codec error');
    alertSpy.mockRestore();
  });

  it('playing=false after play failure', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPlayAudio.mockImplementation(() => {
      throw new Error('codec error');
    });

    const message = msg();

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    // 失败后应该显示 播放语音（不是 停止）
    expect(() => findLabel(tree!, '播放语音')).not.toThrow();
    alertSpy.mockRestore();
  });

  it('displays duration in seconds when available', () => {
    const message = msg({ duration: 12 });

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    const durationNode = tree!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('12″'),
    );
    expect(durationNode).toBeDefined();
  });

  it('does not display duration when zero', () => {
    const message = msg({ duration: 0 });

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    const allText = tree!.root.findAll((node) => typeName(node) === 'Text');
    const hasDuration = allText.some(
      (node) => String(node.children?.join('') ?? '').includes('″'),
    );
    expect(hasDuration).toBe(false);
  });

  it('restores play label after duration-based timer elapses', () => {
    let capturedTimer: (() => void) | null = null;
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      capturedTimer = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const message = msg({ duration: 3 });

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(findLabel(tree!, '停止')).toBeDefined();

    // Fire the duration timer callback manually
    renderer.act(() => {
      capturedTimer?.();
    });

    expect(() => findLabel(tree!, '播放语音')).not.toThrow();

    setTimeoutSpy.mockRestore();
  });

  it('cleans up timer on Stop press', () => {
    let capturedTimer: (() => void) | null = null;
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      capturedTimer = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

    const message = msg({ duration: 5 });

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(mockStopAudio).not.toHaveBeenCalled();

    // Stop before timer fires
    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(mockStopAudio).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalled(); // timer was cleared

    // If the captured timer somehow fires, it should not cause a crash
    // (the component already shows "play" so no state change needed)
    capturedTimer = null;

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('cleans up timer on unmount', () => {
    let capturedTimer: (() => void) | null = null;
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      capturedTimer = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

    const message = msg({ duration: 5 });

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    // Unmount before timer fires
    renderer.act(() => {
      tree!.unmount();
    });

    expect(clearTimeoutSpy).toHaveBeenCalled(); // timer was cleaned up on unmount

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('does not call playAudio when mediaUri is missing', () => {
    const message = msg({ mediaUrl: undefined, thumbnailUrl: undefined });

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    renderer.act(() => {
      findPressable(tree!).props.onPress();
    });

    expect(mockPlayAudio).not.toHaveBeenCalled();
  });
});
