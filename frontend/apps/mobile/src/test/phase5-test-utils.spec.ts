/**
 * Phase 5 verification tests — message fixtures, Alert mock, action helpers,
 * and service mock assertions.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import renderer from 'react-test-renderer';
// ─── Fixture re-exports for type info ──────────────────────────────

import {
  textMessage,
  imageMessage,
  videoMessage,
  voiceMessage,
  fileMessage,
  failedLocalMessage,
  sentOwnMessage,
  sentOtherMessage,
  encryptedMessage,
  mixedMessageSet,
  privateSession,
  groupSession,
  emptySession,
  sessionWithLastMessage,
  resetFixtureCounters,
} from './messageFixtures';

// ─── Action helpers ─────────────────────────────────────────────────

import {
  resetAlertMock,
  getAlertButtons,
  getAlertMock,
  findText,
  pressByText,
  getMockedClipboard,
} from './actionSheetHelpers';

// ─── Helper: create a RN test tree with a Pressable/Text ───────────

function createTestTree(buttonText: string, onPress?: () => void): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(
      React.createElement(View, null,
        React.createElement(Pressable, onPress !== undefined ? { onPress } : {},
          React.createElement(Text, null, buttonText),
        ),
      ),
    );
  });
  return tree!;
}

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetFixtureCounters();
  resetAlertMock();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// 1. Message fixtures — field completeness
// ═══════════════════════════════════════════════════════════════════

describe('message fixtures', () => {
  it('textMessage has all required Message fields', () => {
    const m = textMessage();
    expect(typeof m.id).toBe('string');
    expect(m.messageType).toBe('TEXT');
    expect(m.senderId).toBe('user-1');
    expect(typeof m.content).toBe('string');
    expect(typeof m.sendTime).toBe('string');
    expect(m.status).toBe('SENT');
  });

  it('imageMessage has media fields', () => {
    const m = imageMessage();
    expect(m.messageType).toBe('IMAGE');
    expect(m.mediaUrl).toBeDefined();
    expect(m.mediaName).toBeDefined();
    expect(m.thumbnailUrl).toBeDefined();
    expect(typeof m.mediaSize).toBe('number');
  });

  it('videoMessage has media + duration', () => {
    const m = videoMessage();
    expect(m.messageType).toBe('VIDEO');
    expect(m.mediaUrl).toBeDefined();
    expect(m.duration).toBeGreaterThan(0);
    expect(m.senderId).toBe('user-2');
    expect(m.senderName).toBe('Bob');
  });

  it('voiceMessage has audio media fields', () => {
    const m = voiceMessage();
    expect(m.messageType).toBe('VOICE');
    expect(m.mediaUrl).toContain('.m4a');
    expect(m.duration).toBe(8);
  });

  it('fileMessage has document fields', () => {
    const m = fileMessage();
    expect(m.messageType).toBe('FILE');
    expect(m.mediaUrl).toContain('.pdf');
    expect(m.mediaName).toBe('report_20260517.pdf');
    expect(typeof m.mediaSize).toBe('number');
  });

  it('failedLocalMessage has FAILED status and no messageId', () => {
    const m = failedLocalMessage();
    expect(m.status).toBe('FAILED');
    expect(m.messageId).toBeUndefined();
    expect(m.content).toBe('This send failed');
  });

  it('sentOwnMessage represents current user', () => {
    const m = sentOwnMessage();
    expect(m.senderId).toBe('current-user');
    expect(m.status).toBe('SENT');
  });

  it('sentOtherMessage represents another user', () => {
    const m = sentOtherMessage();
    expect(m.senderId).toBe('other-user');
    expect(m.receiverId).toBe('current-user');
    expect(m.status).toBe('SENT');
  });

  it('encryptedMessage has E2EE fields', () => {
    const m = encryptedMessage();
    expect(m.encrypted).toBe(true);
    expect(m.e2eeEnvelope?.version).toBe(2);
    expect(m.e2eeEnvelope?.algorithm).toBe('rust-x25519-x3dh-dr-v1');
    expect(m.e2eeDeviceId).toBeDefined();
  });

  it('fixture overrides are merged', () => {
    const m = textMessage({ content: 'custom', status: 'READ' });
    expect(m.content).toBe('custom');
    expect(m.status).toBe('READ');
    expect(m.messageType).toBe('TEXT');
  });

  it('mixedMessageSet returns 5 distinct messages', () => {
    const msgs = mixedMessageSet();
    expect(msgs).toHaveLength(5);
    const types = msgs.map((m) => m.messageType);
    expect(types).toEqual(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE']);
  });

  it('each fixture produces unique IDs', () => {
    const a = textMessage();
    const b = textMessage();
    expect(a.id).not.toBe(b.id);
  });

  it('resetFixtureCounters resets IDs', () => {
    const before = textMessage().id;
    resetFixtureCounters();
    const after = textMessage().id;
    expect(after).toBe(before); // counters restart
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. ChatSession fixtures
// ═══════════════════════════════════════════════════════════════════

describe('ChatSession fixtures', () => {
  it('privateSession has correct shape', () => {
    const s = privateSession();
    expect(s.type).toBe('private');
    expect(typeof s.id).toBe('string');
    expect(typeof s.targetId).toBe('string');
    expect(typeof s.targetName).toBe('string');
    expect(s.lastMessage).toBeDefined();
    expect(s.lastMessage!.messageType).toBe('TEXT');
    expect(s.unreadCount).toBe(3);
  });

  it('groupSession has group fields', () => {
    const s = groupSession();
    expect(s.type).toBe('group');
    expect(s.targetName).toBe('Project Team');
    expect(s.memberCount).toBe(15);
    expect(s.isPinned).toBe(true);
    expect(s.lastMessage).toBeDefined();
    expect(s.lastMessage!.groupId).toBe('group-1');
  });

  it('emptySession has no messages', () => {
    const s = emptySession();
    expect(s.unreadCount).toBe(0);
    expect(s.lastMessage).toBeUndefined();
    expect(s.targetName).toBe('Eve');
  });

  it('sessionWithLastMessage uses provided message', () => {
    const msg = textMessage({ content: 'thread starter', id: 'thread-msg-1' });
    const s = sessionWithLastMessage(msg);
    expect(s.lastMessage).toBe(msg);
    expect(s.lastMessageTime).toBe(msg.sendTime);
  });

  it('session overrides are merged', () => {
    const s = privateSession({ id: 'custom-id', isMuted: true });
    expect(s.id).toBe('custom-id');
    expect(s.isMuted).toBe(true);
    expect(s.type).toBe('private');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Alert mock — captures buttons
// ═══════════════════════════════════════════════════════════════════

describe('Alert.alert mock', () => {
  it('getAlertButtons returns empty array when Alert.alert never called', () => {
    expect(getAlertButtons()).toEqual([]);
  });

  it('captures buttons from Alert.alert call', () => {
    const onCopy = jest.fn();
    const onDelete = jest.fn();
    const { Alert } = require('react-native') as { Alert: { alert: jest.Mock } };

    Alert.alert('Actions', 'Choose an action', [
      { text: 'Copy', onPress: onCopy },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);

    const buttons = getAlertButtons();
    expect(buttons).toHaveLength(3);
    expect(buttons[0].text).toBe('Copy');
    expect(buttons[1].text).toBe('Delete');
    expect(buttons[1].style).toBe('destructive');
    expect(buttons[2].text).toBe('Cancel');
    expect(buttons[2].style).toBe('cancel');
  });

  it('getAlertMock returns the underlying jest.Mock', () => {
    const onOk = jest.fn();
    const { Alert } = require('react-native') as { Alert: { alert: jest.Mock } };

    Alert.alert('Title', 'Message', [{ text: 'OK', onPress: onOk }]);

    const mock = getAlertMock();
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe('Title');
    expect(mock.mock.calls[0][1]).toBe('Message');
  });

  it('resetAlertMock clears captured calls', () => {
    const { Alert } = require('react-native') as { Alert: { alert: jest.Mock } };
    Alert.alert('A', 'B', [{ text: 'OK' }]);
    expect(getAlertButtons()).toHaveLength(1);

    resetAlertMock();
    expect(getAlertButtons()).toEqual([]);
  });

  it('handles calls with no buttons array', () => {
    const { Alert } = require('react-native') as { Alert: { alert: jest.Mock } };
    Alert.alert('Info', 'Something happened');
    expect(getAlertButtons()).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. pressByText — triggers onPress
// ═══════════════════════════════════════════════════════════════════

describe('pressByText', () => {
  it('finds a Pressable child by text and calls onPress', () => {
    const onPress = jest.fn();
    const tree = createTestTree('Retry', onPress);

    pressByText(tree.root, 'Retry');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('throws when no Pressable with matching text is found', () => {
    const tree = createTestTree('Confirm', jest.fn());
    expect(() => pressByText(tree.root, 'Missing')).toThrow('no Pressable containing "Missing" found');
  });

  it('does not match Pressables that lack an onPress prop', () => {
    // A Pressable created without onPress is invisible to pressByText
    // because the predicate filters on node.props.onPress != null first.
    const tree = createTestTree('Noop'); // no onPress in props
    // The Pressable is not found
    expect(() => pressByText(tree.root, 'Noop')).toThrow('no Pressable containing "Noop" found');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. findText — checks rendered text
// ═══════════════════════════════════════════════════════════════════

describe('findText', () => {
  it('returns true when text is present', () => {
    const tree = createTestTree('Hello World', jest.fn());
    expect(findText(tree.root, 'Hello')).toBe(true);
    expect(findText(tree.root, 'World')).toBe(true);
  });

  it('returns false when text is absent', () => {
    const tree = createTestTree('Hello', jest.fn());
    expect(findText(tree.root, 'Goodbye')).toBe(false);
  });

  it('works with partial matches', () => {
    const tree = createTestTree('Sending...', jest.fn());
    expect(findText(tree.root, 'Sending')).toBe(true);
    expect(findText(tree.root, 'ending')).toBe(true);
    expect(findText(tree.root, 'Sent')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. messageService mock — delete/recall assertions
// ═══════════════════════════════════════════════════════════════════

describe('messageService mock', () => {
  it('has deleteMessage and recallMessage as jest mocks', () => {
    const { messageService } = require('@/services/chat/__mocks__/messageService') as {
      messageService: {
        deleteMessage: jest.Mock;
        recallMessage: jest.Mock;
      };
    };

    expect(jest.isMockFunction(messageService.deleteMessage)).toBe(true);
    expect(jest.isMockFunction(messageService.recallMessage)).toBe(true);
  });

  it('deleteMessage can be asserted after calling', async () => {
    const { messageService } = require('@/services/chat/__mocks__/messageService') as {
      messageService: {
        deleteMessage: jest.Mock;
      };
    };

    messageService.deleteMessage.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { id: 'msg-deleted', status: 'DELETED' },
    });

    await messageService.deleteMessage('msg-123');
    expect(messageService.deleteMessage).toHaveBeenCalledWith('msg-123');
  });

  it('recallMessage can be asserted after calling', async () => {
    const { messageService } = require('@/services/chat/__mocks__/messageService') as {
      messageService: {
        recallMessage: jest.Mock;
      };
    };

    messageService.recallMessage.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { id: 'msg-recalled', status: 'RECALLED' },
    });

    await messageService.recallMessage('msg-456');
    expect(messageService.recallMessage).toHaveBeenCalledWith('msg-456');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Clipboard mock — setString assertion
// ═══════════════════════════════════════════════════════════════════

describe('clipboard mock', () => {
  it('setString is a jest mock', () => {
    const clipboard = getMockedClipboard();
    expect(jest.isMockFunction(clipboard.setString)).toBe(true);
  });

  it('can assert setString calls', () => {
    const clipboard = getMockedClipboard();
    (clipboard.setString as jest.Mock).mockClear();

    clipboard.setString('copied text here');
    expect(clipboard.setString).toHaveBeenCalledWith('copied text here');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. mediaSave mock — saveImage/saveVideo assertion
// ═══════════════════════════════════════════════════════════════════

describe('mediaSave mock', () => {
  it('saveImage and saveVideo are jest mocks', () => {
    const { mediaSaveService } = require('@/services/media/__mocks__/mediaSaveService') as {
      mediaSaveService: {
        saveImage: jest.Mock;
        saveVideo: jest.Mock;
      };
    };

    expect(jest.isMockFunction(mediaSaveService.saveImage)).toBe(true);
    expect(jest.isMockFunction(mediaSaveService.saveVideo)).toBe(true);
  });

  it('can assert saveImage call', async () => {
    const { mediaSaveService } = require('@/services/media/__mocks__/mediaSaveService') as {
      mediaSaveService: {
        saveImage: jest.Mock;
      };
    };

    await mediaSaveService.saveImage('file:///tmp/photo.jpg');
    expect(mediaSaveService.saveImage).toHaveBeenCalledWith('file:///tmp/photo.jpg');
  });

  it('can assert saveVideo call', async () => {
    const { mediaSaveService } = require('@/services/media/__mocks__/mediaSaveService') as {
      mediaSaveService: {
        saveVideo: jest.Mock;
      };
    };

    await mediaSaveService.saveVideo('file:///tmp/video.mp4');
    expect(mediaSaveService.saveVideo).toHaveBeenCalledWith('file:///tmp/video.mp4');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Linking mock — openUrl/openFile assertion
// ═══════════════════════════════════════════════════════════════════

describe('linking mock', () => {
  it('openUrl and openFile are jest mocks', () => {
    const { platformLinking } = require('@/services/platform/__mocks__/linking') as {
      platformLinking: {
        openUrl: jest.Mock;
        openFile: jest.Mock;
      };
    };

    expect(jest.isMockFunction(platformLinking.openUrl)).toBe(true);
    expect(jest.isMockFunction(platformLinking.openFile)).toBe(true);
  });

  it('can assert openUrl call', async () => {
    const { platformLinking } = require('@/services/platform/__mocks__/linking') as {
      platformLinking: {
        openUrl: jest.Mock;
      };
    };

    await platformLinking.openUrl('https://example.com');
    expect(platformLinking.openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('can assert openFile call', async () => {
    const { platformLinking } = require('@/services/platform/__mocks__/linking') as {
      platformLinking: {
        openFile: jest.Mock;
      };
    };

    await platformLinking.openFile('/tmp/report.pdf', 'application/pdf');
    expect(platformLinking.openFile).toHaveBeenCalledWith('/tmp/report.pdf', 'application/pdf');
  });
});
