/**
 * MessageStatusLine tests — time + status display.
 */

import React from 'react';
import renderer from 'react-test-renderer';
import type { SendPipelineStage } from '@/types/models';

// ─── Mocks before imports ───────────────────────────────────────────

jest.mock('@/utils/time', () => ({
  formatMessageTime: jest.fn((sendTime: string) => sendTime),
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

// ─── Imports after mocks ────────────────────────────────────────────

import { MessageStatusLine } from '../MessageStatusLine';

// ─── Helpers ────────────────────────────────────────────────────────

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function')
    return (node.type as { displayName?: string }).displayName || node.type.name || '';
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

interface Case {
  stage: SendPipelineStage;
  messageStatus?: string;
  uploadProgress?: number;
  expectedStatus: string;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('MessageStatusLine', () => {
  const now = new Date('2026-05-17T14:30:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('time display', () => {
    it('shows formatted time (formatMessageTime called with sendTime)', () => {
      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageStatusLine sendTime="2026-05-17T10:00:00.000Z" mine={false} stage="SENT" />,
        );
      });
      // mock passes sendTime through
      expect(findTextContent(testRenderer!.root, '2026-05-17T10:00:00.000Z')).toBe(true);
    });

    it('shows different-day sendTime', () => {
      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageStatusLine sendTime="2026-05-16T10:00:00.000Z" mine={false} stage="SENT" />,
        );
      });
      expect(findTextContent(testRenderer!.root, '2026-05-16T10:00:00.000Z')).toBe(true);
    });
  });

  describe('own message status', () => {
    const ownCases: Case[] = [
      { stage: 'SENDING', expectedStatus: '发送中' },
      { stage: 'SEND_PENDING', expectedStatus: '发送中' },
      { stage: 'UPLOAD_PENDING', expectedStatus: '准备上传' },
      { stage: 'UPLOADING', uploadProgress: 45, expectedStatus: '上传中 45%' },
      { stage: 'UPLOADING', uploadProgress: 0, expectedStatus: '上传中 0%' },
      { stage: 'SENT', expectedStatus: '已发送' },
      { stage: 'SENT', messageStatus: 'DELIVERED', expectedStatus: '已送达' },
      { stage: 'SENT', messageStatus: 'READ', expectedStatus: '已读' },
    ];

    ownCases.forEach(({ stage, messageStatus, uploadProgress, expectedStatus }) => {
      it(`shows "${expectedStatus}" for stage=${stage} messageStatus=${messageStatus ?? 'none'}`, () => {
        let testRenderer: renderer.ReactTestRenderer;
        renderer.act(() => {
          testRenderer = renderer.create(
            <MessageStatusLine
              sendTime="2026-05-17T10:00:00.000Z"
              mine={true}
              stage={stage}
              messageStatus={messageStatus}
              uploadProgress={uploadProgress}
            />,
          );
        });
        expect(findTextContent(testRenderer!.root, expectedStatus)).toBe(true);
      });
    });

    it('shows no status text for BLOCKED stage', () => {
      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageStatusLine sendTime="2026-05-17T10:00:00.000Z" mine={true} stage="BLOCKED" />,
        );
      });
      expect(findTextContent(testRenderer!.root, '发送中')).toBe(false);
      expect(findTextContent(testRenderer!.root, '已发送')).toBe(false);
      // Still shows time
      expect(findTextContent(testRenderer!.root, '10:00')).toBe(true);
    });
  });

  describe("other's message status", () => {
    const otherStages: SendPipelineStage[] = ['SENT', 'SENDING', 'UPLOADING', 'UPLOAD_FAILED', 'SEND_FAILED'];

    otherStages.forEach((stage) => {
      it(`shows no status text for stage=${stage}`, () => {
        let testRenderer: renderer.ReactTestRenderer;
        renderer.act(() => {
          testRenderer = renderer.create(
            <MessageStatusLine sendTime="2026-05-17T10:00:00.000Z" mine={false} stage={stage} />,
          );
        });
        expect(findTextContent(testRenderer!.root, '已发送')).toBe(false);
        expect(findTextContent(testRenderer!.root, '发送中')).toBe(false);
        expect(findTextContent(testRenderer!.root, '已读')).toBe(false);
        expect(findTextContent(testRenderer!.root, '已送达')).toBe(false);
      });
    });

    it('shows time for other messages', () => {
      let testRenderer: renderer.ReactTestRenderer;
      renderer.act(() => {
        testRenderer = renderer.create(
          <MessageStatusLine sendTime="2026-05-17T10:00:00.000Z" mine={false} stage="SENT" />,
        );
      });
      expect(findTextContent(testRenderer!.root, '10:00')).toBe(true);
    });
  });
});
