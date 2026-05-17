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

// ─── Tests ──────────────────────────────────────────────────────────

describe('VoiceBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayAudio.mockReturnValue(undefined);
    mockStopAudio.mockReturnValue(undefined);
  });

  it('calls playAudio on press when not playing', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith('https://files.example.com/audio/msg.m4a');
    expect(mockStopAudio).not.toHaveBeenCalled();
  });

  it('calls stopAudio on press when currently playing', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    // First press: play
    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );
    renderer.act(() => {
      pressable.props.onPress();
    });

    // Re-find Pressable after state update to get the updated onPress
    const pressableAfterPlay = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    // Second press: stop
    renderer.act(() => {
      pressableAfterPlay.props.onPress();
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

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('播放失败', 'audio codec error');
    alertSpy.mockRestore();
  });

  it('displays duration in seconds when available', () => {
    const message = msg({ duration: 12 });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    const textNode = testRenderer!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('12″'),
    );
    expect(textNode).toBeDefined();
  });

  it('does not display duration when zero', () => {
    const message = msg({ duration: 0 });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    const allText = testRenderer!.root.findAll((node) => typeName(node) === 'Text');
    const hasDuration = allText.some(
      (node) => String(node.children?.join('') ?? '').includes('″'),
    );
    expect(hasDuration).toBe(false);
  });

  it('shows stop label when playing', () => {
    const message = msg();

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<VoiceBubble message={message} mine={false} />);
    });

    // Initially shows 播放语音
    const playText = testRenderer!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('播放语音'),
    );
    expect(playText).toBeDefined();

    const pressable = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable',
    );

    renderer.act(() => {
      pressable.props.onPress();
    });

    // Re-find texts after state update
    const stopText = testRenderer!.root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes('停止'),
    );
    expect(stopText).toBeDefined();
  });
});
