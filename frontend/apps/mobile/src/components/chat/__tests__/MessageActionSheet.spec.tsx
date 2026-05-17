/**
 * MessageActionSheet tests — verifies action menu generation via Alert.alert.
 *
 * Tests that long-press actions match getAvailableMessageActions output,
 * destructive actions require confirmation, disabled actions show reason,
 * and callbacks are invoked correctly.
 */

import type { MessageActionContext } from '@/types/models';
import {
  imageMessage,
  fileMessage,
  failedLocalMessage,
  sentOwnMessage,
  sentOtherMessage,
  encryptedMessage,
  resetFixtureCounters,
} from '@/test/messageFixtures';
import { resetAlertMock, getAlertButtons, getAlertMock } from '@/test/actionSheetHelpers';
import { showMessageActionSheet } from '../MessageActionSheet';

// ─── Mocks before import ────────────────────────────────────────────

jest.mock('@/utils/messageActions', () => {
  const actual = jest.requireActual('@/utils/messageActions') as typeof import('@/utils/messageActions');
  return actual;
});

jest.mock('@/services/platform/clipboard', () => ({
  platformClipboard: { copyText: jest.fn() },
}));

jest.mock('@/services/media/mediaSaveService', () => ({
  mediaSaveService: {
    saveImage: jest.fn(() => Promise.resolve()),
    saveVideo: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/services/platform/linking', () => ({
  platformLinking: {
    openUrl: jest.fn(() => Promise.resolve()),
    openFile: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/services/chat/messageService', () => ({
  messageService: {
    deleteMessage: jest.fn(() => Promise.resolve({ code: 0, message: 'ok', data: { id: 'x', status: 'DELETED' } })),
    recallMessage: jest.fn(() => Promise.resolve({ code: 0, message: 'ok', data: { id: 'x', status: 'RECALLED' } })),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────

function baseCtx(overrides: Partial<MessageActionContext> = {}): MessageActionContext {
  return {
    currentUserId: 'current-user',
    isGroupSession: false,
    now: Date.now(),
    recallWindowMs: 120_000,
    hasMediaUri: true,
    hasRemoteMediaUri: true,
    ...overrides,
  };
}

function emptyCallbacks() {
  return {
    onCopy: jest.fn(),
    onRetry: jest.fn(),
    onDeleteLocal: jest.fn(),
    onRecall: jest.fn(),
    onSaveMedia: jest.fn(),
    onOpenFile: jest.fn(),
    onReadDetail: jest.fn(),
  };
}

/** Press a button by text from the captured Alert. */
function tapButton(buttons: ReturnType<typeof getAlertButtons>, text: string): void {
  const btn = buttons.find((b) => b.text === text);
  if (!btn) {
    throw new Error(`Button "${text}" not found. Available: ${buttons.map((b) => b.text).join(', ')}`);
  }
  btn.onPress?.();
}

/** Return button labels from the most recent Alert. */
function buttonLabels(): string[] {
  return getAlertButtons().map((b) => b.text);
}

// ─── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  resetFixtureCounters();
  resetAlertMock();
  jest.clearAllMocks();
});

describe('MessageActionSheet', () => {
  // ── 1. Long-press text message shows Copy / Delete ──────────────────

  describe('text message (own, sent)', () => {
    it('includes Copy, Recall, Delete, ReadDetail, Forward, Cancel', () => {
      const msg = sentOwnMessage();
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      const labels = buttonLabels();
      expect(labels).toContain('复制');
      expect(labels).toContain('撤回');
      expect(labels).toContain('删除');
      expect(labels).toContain('消息详情');
      expect(labels).toContain('转发');
      expect(labels).toContain('取消');
    });

    it('Copy invokes onCopy callback', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '复制');
      expect(cbs.onCopy).toHaveBeenCalledWith(msg);
    });
  });

  // ── 2. Long-press failed message shows Retry ────────────────────────

  describe('failed message', () => {
    it('includes Retry when message has FAILED status', () => {
      const msg = failedLocalMessage({ senderId: 'current-user' });
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).toContain('重试发送');
    });

    it('Retry invokes onRetry callback', () => {
      const msg = failedLocalMessage({ senderId: 'current-user' });
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '重试发送');
      expect(cbs.onRetry).toHaveBeenCalledWith(msg);
    });
  });

  // ── 3. Long-press own sent message shows Recall ─────────────────────

  describe('recall', () => {
    it('includes Recall for own sent message', () => {
      const msg = sentOwnMessage();
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).toContain('撤回');
    });

    it('does not include Recall for others messages', () => {
      const msg = sentOtherMessage();
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).not.toContain('撤回');
    });

    it('Recall shows confirmation alert before executing', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      // Tap Recall — should NOT execute callback directly
      tapButton(getAlertButtons(), '撤回');
      expect(cbs.onRecall).not.toHaveBeenCalled();

      // A second Alert appears (confirmation)
      const confirmButtons = getAlertButtons();
      expect(confirmButtons.map((b) => b.text)).toContain('撤回');
      expect(confirmButtons.map((b) => b.text)).toContain('取消');

      // Tap the destructive confirm button
      tapButton(confirmButtons, '撤回');
      expect(cbs.onRecall).toHaveBeenCalledWith(msg);
    });

    it('Recall confirmation Cancel does not execute', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '撤回');
      tapButton(getAlertButtons(), '取消');
      expect(cbs.onRecall).not.toHaveBeenCalled();
    });
  });

  // ── 4. Long-press image shows Save ──────────────────────────────────

  describe('saveMedia', () => {
    it('includes Save for IMAGE with local mediaUri', () => {
      const msg = imageMessage({
        senderId: 'current-user',
        mediaUrl: 'file:///storage/photo.jpg',
        thumbnailUrl: 'file:///storage/thumb.jpg',
      });
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).toContain('保存');
    });

    it('Save invokes onSaveMedia callback', () => {
      const msg = imageMessage({
        senderId: 'current-user',
        mediaUrl: 'file:///storage/photo.jpg',
        thumbnailUrl: 'file:///storage/thumb.jpg',
      });
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '保存');
      expect(cbs.onSaveMedia).toHaveBeenCalledWith(msg);
    });

    it('does not include Save for IMAGE with remote-only URI when hasMediaUri=false', () => {
      const msg = imageMessage({
        senderId: 'current-user',
        mediaUrl: 'https://files.example.com/photo.jpg',
      });
      showMessageActionSheet(msg, baseCtx({ hasMediaUri: false }), emptyCallbacks());

      expect(buttonLabels()).not.toContain('保存');
    });
  });

  // ── 5. Long-press file shows Open file ──────────────────────────────

  describe('openFile', () => {
    it('includes Open file for FILE with local mediaUri', () => {
      const msg = fileMessage({
        senderId: 'current-user',
        mediaUrl: 'file:///storage/report.pdf',
      });
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).toContain('打开文件');
    });

    it('Open file invokes onOpenFile callback', () => {
      const msg = fileMessage({
        senderId: 'current-user',
        mediaUrl: 'file:///storage/report.pdf',
      });
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '打开文件');
      expect(cbs.onOpenFile).toHaveBeenCalledWith(msg);
    });
  });

  // ── 6. Cancel does not execute actions ──────────────────────────────

  describe('cancel', () => {
    it('Cancel does not invoke any callback', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '取消');

      expect(cbs.onCopy).not.toHaveBeenCalled();
      expect(cbs.onRetry).not.toHaveBeenCalled();
      expect(cbs.onDeleteLocal).not.toHaveBeenCalled();
      expect(cbs.onRecall).not.toHaveBeenCalled();
      expect(cbs.onSaveMedia).not.toHaveBeenCalled();
      expect(cbs.onOpenFile).not.toHaveBeenCalled();
      expect(cbs.onReadDetail).not.toHaveBeenCalled();
    });
  });

  // ── 7. Delete/Recall have confirmation ──────────────────────────────

  describe('deleteLocal confirmation', () => {
    it('Delete shows confirmation alert before executing', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '删除');
      expect(cbs.onDeleteLocal).not.toHaveBeenCalled();

      const confirmButtons = getAlertButtons();
      expect(confirmButtons.map((b) => b.text)).toContain('删除');
      expect(confirmButtons.map((b) => b.text)).toContain('取消');

      tapButton(confirmButtons, '删除');
      expect(cbs.onDeleteLocal).toHaveBeenCalledWith(msg);
    });

    it('Delete confirmation Cancel does not execute', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '删除');
      tapButton(getAlertButtons(), '取消');
      expect(cbs.onDeleteLocal).not.toHaveBeenCalled();
    });
  });

  // ── 8. Disabled forward does not execute ────────────────────────────

  describe('forward (disabled)', () => {
    it('Forward is present in the menu', () => {
      const msg = sentOwnMessage();
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).toContain('转发');
    });

    it('Forward does not execute (shows reason alert)', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '转发');

      // Should show a reason alert (Alert.alert with title + message, no buttons)
      const alertMock = getAlertMock();
      expect(alertMock).toHaveBeenCalledTimes(2); // first: action sheet, second: reason
      expect(alertMock.mock.calls[1][0]).toBe('转发');
      expect(alertMock.mock.calls[1][1]).toBe('转发功能即将推出');
    });
  });

  // ── 9. Encrypted message does not show Copy ─────────────────────────

  describe('encrypted message', () => {
    it('does not include Copy in the menu', () => {
      const msg = encryptedMessage({ senderId: 'current-user' });
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      expect(buttonLabels()).not.toContain('复制');
    });

    it('includes Delete and Forward only for encrypted non-own text', () => {
      const msg = encryptedMessage({ senderId: 'other-user' });
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());

      const labels = buttonLabels();
      expect(labels).toContain('删除');
      expect(labels).toContain('转发');
      expect(labels).not.toContain('复制');
      expect(labels).not.toContain('撤回');
    });
  });

  // ── 10. ReadDetail invokes callback ─────────────────────────────────

  describe('readDetail', () => {
    it('is present in the menu for own sent message', () => {
      const msg = sentOwnMessage();
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());
      expect(buttonLabels()).toContain('消息详情');
    });

    it('invokes onReadDetail callback when tapped', () => {
      const msg = sentOwnMessage();
      const cbs = emptyCallbacks();
      showMessageActionSheet(msg, baseCtx(), cbs);

      tapButton(getAlertButtons(), '消息详情');
      expect(cbs.onReadDetail).toHaveBeenCalledWith(msg);
    });

    it('is absent for other messages', () => {
      const msg = sentOtherMessage();
      showMessageActionSheet(msg, baseCtx(), emptyCallbacks());
      expect(buttonLabels()).not.toContain('消息详情');
    });
  });

  // ── 11. Disabled action shows reason when tapped ────────────────────

  describe('disabled actions', () => {
    it('disabled Recall (outside window) shows reason alert', () => {
      const msg = sentOwnMessage({
        sendTime: new Date(Date.now() - 300_000).toISOString(), // 5 min ago
      });
      showMessageActionSheet(msg, baseCtx({ recallWindowMs: 120_000 }), emptyCallbacks());

      // Recall should still be in the menu
      expect(buttonLabels()).toContain('撤回');

      // Tap it — should show reason, not execute
      tapButton(getAlertButtons(), '撤回');

      // The reason alert should be shown
      const reasonAlert = getAlertMock();
      expect(reasonAlert).toHaveBeenCalledTimes(2); // first call: action sheet, second: reason
    });
  });
});
