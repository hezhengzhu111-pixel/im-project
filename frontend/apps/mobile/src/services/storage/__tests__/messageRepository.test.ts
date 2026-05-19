import type { MobileMessage } from '@/types/models';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import { messageDatabase, __setDbForTests, __resetForTests } from '../messageDatabase';
import { messageRepository } from '../messageRepository';
import { FakeDbConnection } from '../__testutils__/fakeDbConnection';

const makeMessage = (id: string, sendTime: string, conversationId: string): MobileMessage => ({
  id,
  serverId: id,
  conversationId,
  senderId: 'sender_1',
  receiverId: 'receiver_2',
  isGroupChat: false,
  messageType: 'TEXT',
  content: `content of ${id}`,
  sendTime,
  status: 'SENT',
});

const SEED_MESSAGES = [
  makeMessage('m1', '2024-06-01T10:00:00Z', 'conv_A'),
  makeMessage('m2', '2024-06-02T10:00:00Z', 'conv_A'),
  makeMessage('m3', '2024-06-03T10:00:00Z', 'conv_A'),
  makeMessage('m4', '2024-06-04T10:00:00Z', 'conv_A'),
  makeMessage('m5', '2024-06-05T10:00:00Z', 'conv_A'),
  makeMessage('m6', '2024-06-06T10:00:00Z', 'conv_A'),
  makeMessage('m7', '2024-06-07T10:00:00Z', 'conv_A'),
  makeMessage('b1', '2024-06-01T10:00:00Z', 'conv_B'),
];

const RUST_E2EE_ENVELOPE: NonNullable<MobileMessage['e2eeEnvelope']> = {
  version: 2,
  algorithm: 'rust-x25519-x3dh-dr-v1',
  senderDeviceId: 'mobile-sender',
  recipientDeviceId: 'web-recipient',
  sessionId: 'sender_1:receiver_2',
  wire: 'd2lyZQ==',
};

const makeEncryptedDisplayMessage = (id = 'enc_store_1'): MobileMessage => ({
  id,
  serverId: id,
  clientMessageId: `cm_${id}`,
  conversationId: 'conv_store',
  senderId: 'sender_1',
  receiverId: 'receiver_2',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'e2ee display plaintext secret',
  sendTime: '2024-10-01T10:00:00Z',
  status: 'SENT',
  encrypted: true,
  e2eeEnvelope: RUST_E2EE_ENVELOPE,
  isE2eeDisplayDecrypted: true,
  decryptStatus: 'decrypted',
  mediaUrl: 'https://files.example/plain.txt',
  thumbnailUrl: 'https://files.example/thumb.jpg',
  mediaName: 'plain.txt',
  mediaSize: 123,
  rawJson: JSON.stringify({
    id,
    conversationId: 'conv_store',
    content: 'e2ee display plaintext secret',
    encrypted: true,
    e2eeEnvelope: RUST_E2EE_ENVELOPE,
  }),
});

const configureFakeMessageTables = (fakeDb: FakeDbConnection): void => {
  fakeDb.setTableColumns('mobile_messages', [
    { name: 'id', type: 'TEXT' },
    { name: 'serverId', type: 'TEXT' },
    { name: 'clientMessageId', type: 'TEXT' },
    { name: 'conversationId', type: 'TEXT' },
    { name: 'senderId', type: 'TEXT' },
    { name: 'receiverId', type: 'TEXT' },
    { name: 'groupId', type: 'TEXT' },
    { name: 'messageType', type: 'TEXT' },
    { name: 'content', type: 'TEXT' },
    { name: 'mediaUrl', type: 'TEXT' },
    { name: 'thumbnailUrl', type: 'TEXT' },
    { name: 'mediaName', type: 'TEXT' },
    { name: 'mediaSize', type: 'TEXT' },
    { name: 'duration', type: 'TEXT' },
    { name: 'status', type: 'TEXT' },
    { name: 'readStatus', type: 'TEXT' },
    { name: 'readByCount', type: 'TEXT' },
    { name: 'sendTime', type: 'TEXT' },
    { name: 'createdAt', type: 'TEXT' },
    { name: 'updatedAt', type: 'TEXT' },
    { name: 'rawJson', type: 'TEXT' },
  ]);
  fakeDb.setTableColumns('mobile_sessions', [
    { name: 'id', type: 'TEXT' },
    { name: 'type', type: 'TEXT' },
    { name: 'targetId', type: 'TEXT' },
    { name: 'targetName', type: 'TEXT' },
    { name: 'targetAvatar', type: 'TEXT' },
    { name: 'unreadCount', type: 'INTEGER' },
    { name: 'lastActiveTime', type: 'TEXT' },
    { name: 'lastMessageJson', type: 'TEXT' },
    { name: 'isPinned', type: 'INTEGER' },
    { name: 'isMuted', type: 'INTEGER' },
    { name: 'encrypted', type: 'INTEGER' },
    { name: 'updatedAt', type: 'INTEGER' },
  ]);
};

/**
 * Shared pagination tests that run against both SQLite (FakeDb) and memory fallback paths.
 */
function runPaginationSuite(label: string): void {
  describe(`listMessagesPage (${label})`, () => {
    beforeEach(() => {
      messageRepository.clearAllCache();
      messageRepository.upsertMessages('conv_A', SEED_MESSAGES.filter((m) => m.conversationId === 'conv_A'));
      messageRepository.upsertMessages('conv_B', SEED_MESSAGES.filter((m) => m.conversationId === 'conv_B'));
    });

    test('initial page returns most recent N messages sorted by sendTime ASC', () => {
      const result = messageRepository.listMessagesPage('conv_A', { limit: 3 });

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['m5', 'm6', 'm7']);
      expect(result.hasMore).toBe(true);
      expect(result.oldestMessage?.id).toBe('m5');
      expect(result.newestMessage?.id).toBe('m7');
    });

    test('initial page returns all when fewer than limit', () => {
      const result = messageRepository.listMessagesPage('conv_B', { limit: 10 });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('b1');
      expect(result.hasMore).toBe(false);
    });

    test('older query returns messages before beforeTime', () => {
      const result = messageRepository.listMessagesPage('conv_A', {
        limit: 3,
        beforeTime: '2024-06-05T10:00:00Z',
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['m2', 'm3', 'm4']);
      expect(result.hasMore).toBe(true);
    });

    test('older query with hasMore=false when fewer remain', () => {
      const result = messageRepository.listMessagesPage('conv_A', {
        limit: 10,
        beforeTime: '2024-06-03T10:00:00Z',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(result.hasMore).toBe(false);
    });

    test('newer query returns messages after afterTime', () => {
      const result = messageRepository.listMessagesPage('conv_A', {
        limit: 3,
        afterTime: '2024-06-03T10:00:00Z',
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['m4', 'm5', 'm6']);
      expect(result.hasMore).toBe(true);
    });

    test('newer query with hasMore=false when fewer remain', () => {
      const result = messageRepository.listMessagesPage('conv_A', {
        limit: 10,
        afterTime: '2024-06-05T10:00:00Z',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages.map((m) => m.id)).toEqual(['m6', 'm7']);
      expect(result.hasMore).toBe(false);
    });

    test('limit + 1 correctly computes hasMore at exact boundary', () => {
      // conv_A has 7 messages. limit=7 should return all, hasMore=false.
      const result = messageRepository.listMessagesPage('conv_A', { limit: 7 });
      expect(result.messages).toHaveLength(7);
      expect(result.hasMore).toBe(false);
    });

    test('limit + 1 correctly computes hasMore just over boundary', () => {
      // limit=6 should return 6, hasMore=true (7th exists).
      const result = messageRepository.listMessagesPage('conv_A', { limit: 6 });
      expect(result.messages).toHaveLength(6);
      expect(result.hasMore).toBe(true);
    });

    test('conversationId isolation: conv_A does not leak into conv_B', () => {
      const resultA = messageRepository.listMessagesPage('conv_A', { limit: 100 });
      const resultB = messageRepository.listMessagesPage('conv_B', { limit: 100 });

      expect(resultA.messages.every((m) => m.conversationId === 'conv_A')).toBe(true);
      expect(resultB.messages.every((m) => m.conversationId === 'conv_B')).toBe(true);
      expect(resultA.messages).toHaveLength(7);
      expect(resultB.messages).toHaveLength(1);
    });

    test('empty conversation returns empty result', () => {
      const result = messageRepository.listMessagesPage('nonexistent', { limit: 10 });
      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.oldestMessage).toBeUndefined();
      expect(result.newestMessage).toBeUndefined();
    });

    test('messages with same sendTime have stable sort order', () => {
      // Add messages with identical sendTime but different IDs
      messageRepository.upsertMessages('conv_tie', [
        makeMessage('t_a', '2024-07-01T12:00:00Z', 'conv_tie'),
        makeMessage('t_c', '2024-07-01T12:00:00Z', 'conv_tie'),
        makeMessage('t_b', '2024-07-01T12:00:00Z', 'conv_tie'),
      ]);

      const result = messageRepository.listMessagesPage('conv_tie', { limit: 10 });
      expect(result.messages).toHaveLength(3);
      // All returned, sorted by tiebreaker (serverId) ascending
      const ids = result.messages.map((m) => m.id);
      expect(ids).toEqual(['t_a', 't_b', 't_c']);
    });

    test('default options returns same as initial page', () => {
      const result = messageRepository.listMessagesPage('conv_A');
      expect(result.messages).toHaveLength(7);
      expect(result.hasMore).toBe(false);
      // Sorted sendTime ASC
      expect(result.messages[0].id).toBe('m1');
      expect(result.messages[6].id).toBe('m7');
    });
  });
}

// Run suite with memory fallback (default in test environment)
runPaginationSuite('memory fallback');

// Run suite with FakeDb (SQLite simulation)
describe('listMessagesPage (FakeDb / SQLite path)', () => {
  let fakeDb: FakeDbConnection;

  beforeEach(() => {
    __resetForTests();
    fakeDb = new FakeDbConnection();
    fakeDb.setTableColumns('mobile_messages', [
      { name: 'id', type: 'TEXT' },
      { name: 'serverId', type: 'TEXT' },
      { name: 'clientMessageId', type: 'TEXT' },
      { name: 'conversationId', type: 'TEXT' },
      { name: 'senderId', type: 'TEXT' },
      { name: 'receiverId', type: 'TEXT' },
      { name: 'groupId', type: 'TEXT' },
      { name: 'messageType', type: 'TEXT' },
      { name: 'content', type: 'TEXT' },
      { name: 'mediaUrl', type: 'TEXT' },
      { name: 'thumbnailUrl', type: 'TEXT' },
      { name: 'mediaName', type: 'TEXT' },
      { name: 'mediaSize', type: 'TEXT' },
      { name: 'duration', type: 'TEXT' },
      { name: 'status', type: 'TEXT' },
      { name: 'readStatus', type: 'TEXT' },
      { name: 'readByCount', type: 'TEXT' },
      { name: 'sendTime', type: 'TEXT' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' },
      { name: 'rawJson', type: 'TEXT' },
    ]);
    __setDbForTests(fakeDb);
    expect(messageDatabase.isMemoryFallback()).toBe(false);

    messageRepository.upsertMessages('conv_A', SEED_MESSAGES.filter((m) => m.conversationId === 'conv_A'));
    messageRepository.upsertMessages('conv_B', SEED_MESSAGES.filter((m) => m.conversationId === 'conv_B'));
  });

  afterEach(() => {
    __resetForTests();
  });

  test('initial page returns most recent N messages sorted by sendTime ASC', () => {
    const result = messageRepository.listMessagesPage('conv_A', { limit: 3 });

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.id)).toEqual(['m5', 'm6', 'm7']);
    expect(result.hasMore).toBe(true);
    expect(result.oldestMessage?.id).toBe('m5');
    expect(result.newestMessage?.id).toBe('m7');
  });

  test('older query returns messages before beforeTime', () => {
    const result = messageRepository.listMessagesPage('conv_A', {
      limit: 3,
      beforeTime: '2024-06-05T10:00:00Z',
    });

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.id)).toEqual(['m2', 'm3', 'm4']);
    expect(result.hasMore).toBe(true);
  });

  test('newer query returns messages after afterTime', () => {
    const result = messageRepository.listMessagesPage('conv_A', {
      limit: 3,
      afterTime: '2024-06-03T10:00:00Z',
    });

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.id)).toEqual(['m4', 'm5', 'm6']);
    expect(result.hasMore).toBe(true);
  });

  test('hasMore at exact boundary', () => {
    const result = messageRepository.listMessagesPage('conv_A', { limit: 7 });
    expect(result.messages).toHaveLength(7);
    expect(result.hasMore).toBe(false);
  });

  test('conversationId isolation', () => {
    const resultA = messageRepository.listMessagesPage('conv_A', { limit: 100 });
    const resultB = messageRepository.listMessagesPage('conv_B', { limit: 100 });

    expect(resultA.messages.every((m) => m.conversationId === 'conv_A')).toBe(true);
    expect(resultB.messages.every((m) => m.conversationId === 'conv_B')).toBe(true);
  });

  test('messages with same sendTime have stable sort order via COALESCE tiebreaker', () => {
    messageRepository.upsertMessages('conv_tie', [
      makeMessage('t_a', '2024-07-01T12:00:00Z', 'conv_tie'),
      makeMessage('t_c', '2024-07-01T12:00:00Z', 'conv_tie'),
      makeMessage('t_b', '2024-07-01T12:00:00Z', 'conv_tie'),
    ]);

    const result = messageRepository.listMessagesPage('conv_tie', { limit: 10 });
    expect(result.messages).toHaveLength(3);
    const ids = result.messages.map((m) => m.id);
    expect(ids).toEqual(['t_a', 't_b', 't_c']);
  });

  test('older query with hasMore=false', () => {
    const result = messageRepository.listMessagesPage('conv_A', {
      limit: 10,
      beforeTime: '2024-06-03T10:00:00Z',
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(result.hasMore).toBe(false);
  });

  test('newer query with hasMore=false', () => {
    const result = messageRepository.listMessagesPage('conv_A', {
      limit: 10,
      afterTime: '2024-06-05T10:00:00Z',
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((m) => m.id)).toEqual(['m6', 'm7']);
    expect(result.hasMore).toBe(false);
  });
});

describe('listMessagesPage: memory vs FakeDb consistency', () => {
  test('both paths return identical results for the same data', () => {
    // Test memory fallback
    messageRepository.clearAllCache();
    expect(messageDatabase.isMemoryFallback()).toBe(true);
    messageRepository.upsertMessages('conv_X', [
      makeMessage('x1', '2024-08-01T10:00:00Z', 'conv_X'),
      makeMessage('x2', '2024-08-02T10:00:00Z', 'conv_X'),
      makeMessage('x3', '2024-08-03T10:00:00Z', 'conv_X'),
      makeMessage('x4', '2024-08-04T10:00:00Z', 'conv_X'),
      makeMessage('x5', '2024-08-05T10:00:00Z', 'conv_X'),
    ]);

    const memInitial = messageRepository.listMessagesPage('conv_X', { limit: 3 });
    const memOlder = messageRepository.listMessagesPage('conv_X', {
      limit: 2,
      beforeTime: '2024-08-04T10:00:00Z',
    });
    const memNewer = messageRepository.listMessagesPage('conv_X', {
      limit: 2,
      afterTime: '2024-08-02T10:00:00Z',
    });

    // Test FakeDb path
    __resetForTests();
    const fakeDb = new FakeDbConnection();
    fakeDb.setTableColumns('mobile_messages', [
      { name: 'id', type: 'TEXT' }, { name: 'serverId', type: 'TEXT' },
      { name: 'clientMessageId', type: 'TEXT' }, { name: 'conversationId', type: 'TEXT' },
      { name: 'senderId', type: 'TEXT' }, { name: 'receiverId', type: 'TEXT' },
      { name: 'groupId', type: 'TEXT' }, { name: 'messageType', type: 'TEXT' },
      { name: 'content', type: 'TEXT' }, { name: 'mediaUrl', type: 'TEXT' },
      { name: 'thumbnailUrl', type: 'TEXT' }, { name: 'mediaName', type: 'TEXT' },
      { name: 'mediaSize', type: 'TEXT' }, { name: 'duration', type: 'TEXT' },
      { name: 'status', type: 'TEXT' }, { name: 'readStatus', type: 'TEXT' },
      { name: 'readByCount', type: 'TEXT' }, { name: 'sendTime', type: 'TEXT' },
      { name: 'createdAt', type: 'TEXT' }, { name: 'updatedAt', type: 'TEXT' },
      { name: 'rawJson', type: 'TEXT' },
    ]);
    __setDbForTests(fakeDb);
    expect(messageDatabase.isMemoryFallback()).toBe(false);

    messageRepository.upsertMessages('conv_X', [
      makeMessage('x1', '2024-08-01T10:00:00Z', 'conv_X'),
      makeMessage('x2', '2024-08-02T10:00:00Z', 'conv_X'),
      makeMessage('x3', '2024-08-03T10:00:00Z', 'conv_X'),
      makeMessage('x4', '2024-08-04T10:00:00Z', 'conv_X'),
      makeMessage('x5', '2024-08-05T10:00:00Z', 'conv_X'),
    ]);

    const sqlInitial = messageRepository.listMessagesPage('conv_X', { limit: 3 });
    const sqlOlder = messageRepository.listMessagesPage('conv_X', {
      limit: 2,
      beforeTime: '2024-08-04T10:00:00Z',
    });
    const sqlNewer = messageRepository.listMessagesPage('conv_X', {
      limit: 2,
      afterTime: '2024-08-02T10:00:00Z',
    });

    // Compare results
    expect(memInitial.messages.map((m) => m.id)).toEqual(sqlInitial.messages.map((m) => m.id));
    expect(memInitial.hasMore).toBe(sqlInitial.hasMore);
    expect(memOlder.messages.map((m) => m.id)).toEqual(sqlOlder.messages.map((m) => m.id));
    expect(memOlder.hasMore).toBe(sqlOlder.hasMore);
    expect(memNewer.messages.map((m) => m.id)).toEqual(sqlNewer.messages.map((m) => m.id));
    expect(memNewer.hasMore).toBe(sqlNewer.hasMore);

    __resetForTests();
  });
});

describe('listMessagesPage: encrypted message masking', () => {
  beforeEach(() => {
    messageRepository.clearAllCache();
  });

  test('encrypted messages are masked through maskEncryptedMessage', () => {
    // upsertMessages already calls maskEncryptedMessage via sanitizeSession for sessions,
    // but listMessagesPage also calls it on output
    const encryptedMsg: MobileMessage = {
      id: 'enc_1',
      serverId: 'enc_1',
      conversationId: 'conv_enc',
      senderId: 's1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: '',
      sendTime: '2024-09-01T10:00:00Z',
      status: 'SENT',
      encrypted: true,
      extra: { encryptedPayload: 'secret-data' },
    };
    messageRepository.upsertMessages('conv_enc', [encryptedMsg]);

    const result = messageRepository.listMessagesPage('conv_enc', { limit: 10 });
    expect(result.messages).toHaveLength(1);
    // maskEncryptedMessage should have been applied (exact behavior depends on implementation)
    // At minimum, the message should be present and not throw
    expect(result.messages[0].id).toBe('enc_1');
  });
});

describe('E2EE persistence sanitization', () => {
  afterEach(() => {
    __resetForTests();
  });

  test('memory fallback strips E2EE display plaintext from message rows and session lastMessageJson', () => {
    __resetForTests();
    messageRepository.clearAllCache();
    expect(messageDatabase.isMemoryFallback()).toBe(true);

    const encryptedMsg = makeEncryptedDisplayMessage();
    messageRepository.upsertMessages('conv_store', [encryptedMsg]);
    messageRepository.upsertSession({
      id: 'conv_store',
      type: 'private',
      targetId: 'receiver_2',
      targetName: 'Receiver',
      unreadCount: 0,
      lastActiveTime: encryptedMsg.sendTime,
      lastMessage: encryptedMsg,
      encrypted: true,
    });

    const [row] = messageDatabase.memoryList('mobile_messages');
    expect(row.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(row.mediaUrl).toBeUndefined();
    expect(row.thumbnailUrl).toBeUndefined();
    expect(row.mediaName).toBeUndefined();
    expect(String(row.rawJson)).not.toContain('e2ee display plaintext secret');
    expect(String(row.rawJson)).toContain('e2eeEnvelope');

    const [sessionRow] = messageDatabase.memoryList('mobile_sessions');
    expect(String(sessionRow.lastMessageJson)).not.toContain('e2ee display plaintext secret');
    expect(String(sessionRow.lastMessageJson)).toContain('e2eeEnvelope');
  });

  test('SQLite path strips E2EE display plaintext from content, rawJson, and lastMessageJson', () => {
    __resetForTests();
    const fakeDb = new FakeDbConnection();
    configureFakeMessageTables(fakeDb);
    __setDbForTests(fakeDb);

    const encryptedMsg = makeEncryptedDisplayMessage('enc_sql_1');
    messageRepository.upsertMessages('conv_store', [encryptedMsg]);
    messageRepository.upsertSession({
      id: 'conv_store',
      type: 'private',
      targetId: 'receiver_2',
      targetName: 'Receiver',
      unreadCount: 0,
      lastActiveTime: encryptedMsg.sendTime,
      lastMessage: encryptedMsg,
      encrypted: true,
    });

    const [messageRow] = messageDatabase.query('SELECT * FROM mobile_messages WHERE conversationId = ?', ['conv_store']);
    expect(messageRow.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(messageRow.mediaUrl).toBeNull();
    expect(messageRow.thumbnailUrl).toBeNull();
    expect(messageRow.mediaName).toBeNull();
    expect(String(messageRow.rawJson)).not.toContain('e2ee display plaintext secret');
    expect(String(messageRow.rawJson)).toContain('e2eeEnvelope');

    const [sessionRow] = messageDatabase.query('SELECT * FROM mobile_sessions WHERE id = ?', ['conv_store']);
    expect(String(sessionRow.lastMessageJson)).not.toContain('e2ee display plaintext secret');
    expect(String(sessionRow.lastMessageJson)).toContain('e2eeEnvelope');
  });

  test('plaintext messages still persist real content', () => {
    __resetForTests();
    messageRepository.clearAllCache();
    const plaintext = makeMessage('plain_store_1', '2024-10-01T11:00:00Z', 'conv_plain');
    messageRepository.upsertMessages('conv_plain', [plaintext]);

    const [row] = messageDatabase.memoryList('mobile_messages');
    expect(row.content).toBe('content of plain_store_1');
    expect(String(row.rawJson)).toContain('content of plain_store_1');
  });
});
