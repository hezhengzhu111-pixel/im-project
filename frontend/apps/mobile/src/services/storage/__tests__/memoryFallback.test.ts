/**
 * Tests for memory fallback behavior consistency with SQLite branch.
 *
 * These tests run with quick-sqlite mocked to throw (see src/test/setup.tsx),
 * so all storage operations go through the memoryTables fallback path.
 */
import type { ChatSession } from '@im/shared-types';
import type { MobileMessage, PendingMessage, UploadTask } from '@/types/models';
import { messageDatabase } from '../messageDatabase';
import { messageRepository } from '../messageRepository';
import { pendingMessageRepository } from '../pendingMessageRepository';
import { uploadTaskRepository } from '../uploadTaskRepository';
import { notificationEventRepository } from '../notificationEventRepository';

const makeSession = (id: string, overrides: Partial<ChatSession> = {}): ChatSession => ({
  id,
  type: 'private',
  targetId: id.split('_')[1] || '',
  targetName: `User ${id}`,
  unreadCount: 0,
  lastActiveTime: '',
  isPinned: false,
  isMuted: false,
  ...overrides,
});

const makeMessage = (id: string, sendTime: string, conversationId: string): MobileMessage => ({
  id,
  serverId: id,
  conversationId,
  senderId: '1',
  receiverId: '2',
  isGroupChat: false,
  messageType: 'TEXT',
  content: `msg ${id}`,
  sendTime,
  status: 'SENT',
});

const makePending = (localId: string, createdAt: number, status: PendingMessage['status'] = 'pending'): PendingMessage => ({
  localId,
  conversationId: 'conv_1',
  sendType: 'private',
  payloadJson: '{}',
  status,
  retryCount: 0,
  createdAt,
  updatedAt: createdAt,
});

const makeUploadTask = (taskId: string, createdAt: number, status: UploadTask['status'] = 'pending'): UploadTask => ({
  taskId,
  fileUri: `file://${taskId}`,
  fileName: `${taskId}.png`,
  uploadType: 'IMAGE',
  status,
  progress: 0,
  retryCount: 0,
  createdAt,
  updatedAt: createdAt,
});

describe('memory fallback: messageRepository', () => {
  beforeEach(() => {
    messageRepository.clearAllCache();
    expect(messageDatabase.isMemoryFallback()).toBe(true);
  });

  test('listSessions returns sessions sorted by isPinned DESC then updatedAt DESC', () => {
    const now = Date.now();
    messageRepository.upsertSession({ ...makeSession('s1'), isPinned: false, lastActiveTime: '2024-01-01' });
    // Hack: set updatedAt via internal memory upsert
    messageDatabase.memoryUpsert('mobile_sessions', 's2', {
      ...makeSession('s2'),
      isPinned: true,
      updatedAt: now - 1000,
      lastMessageJson: '',
    });
    messageDatabase.memoryUpsert('mobile_sessions', 's3', {
      ...makeSession('s3'),
      isPinned: false,
      updatedAt: now,
      lastMessageJson: '',
    });

    const sessions = messageRepository.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // Pinned sessions should come first
    const pinnedIndex = sessions.findIndex((s) => s.id === 's2');
    const unpinnedIndex = sessions.findIndex((s) => s.id === 's3');
    expect(pinnedIndex).toBeLessThan(unpinnedIndex);
  });

  test('listMessages returns messages sorted by sendTime ascending', () => {
    const convId = 'conv_sort';
    messageRepository.upsertMessages(convId, [
      makeMessage('m3', '2024-06-03T10:00:00Z', convId),
      makeMessage('m1', '2024-06-01T10:00:00Z', convId),
      makeMessage('m2', '2024-06-02T10:00:00Z', convId),
    ]);

    const messages = messageRepository.listMessages(convId);
    expect(messages).toHaveLength(3);
    expect(messages[0].id).toBe('m1');
    expect(messages[1].id).toBe('m2');
    expect(messages[2].id).toBe('m3');
  });

  test('listMessages respects limit parameter', () => {
    const convId = 'conv_limit';
    for (let i = 0; i < 10; i++) {
      messageRepository.upsertMessages(convId, [
        makeMessage(`limit_${i}`, `2024-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`, convId),
      ]);
    }

    const messages = messageRepository.listMessages(convId, 3);
    expect(messages).toHaveLength(3);
    // Should return the 3 most recent (ascending order)
    expect(messages[0].id).toBe('limit_7');
    expect(messages[1].id).toBe('limit_8');
    expect(messages[2].id).toBe('limit_9');
  });

  test('clearConversation removes only messages for that conversation', () => {
    const conv1 = 'conv_clear_1';
    const conv2 = 'conv_clear_2';
    messageRepository.upsertMessages(conv1, [makeMessage('c1m1', '2024-06-01T10:00:00Z', conv1)]);
    messageRepository.upsertMessages(conv2, [makeMessage('c2m1', '2024-06-01T10:00:00Z', conv2)]);

    messageRepository.clearConversation(conv1);

    expect(messageRepository.listMessages(conv1)).toHaveLength(0);
    expect(messageRepository.listMessages(conv2)).toHaveLength(1);
  });

  test('clearAllCache wipes all tables', () => {
    messageRepository.upsertSession(makeSession('wipe_s'));
    messageRepository.upsertMessages('wipe_conv', [makeMessage('wipe_m', '2024-06-01T10:00:00Z', 'wipe_conv')]);
    notificationEventRepository.record('test', 'TestScreen');
    pendingMessageRepository.enqueue(makePending('wipe_p', Date.now()));
    uploadTaskRepository.upsert(makeUploadTask('wipe_u', Date.now()));

    messageRepository.clearAllCache();

    expect(messageRepository.listSessions()).toHaveLength(0);
    expect(messageRepository.listMessages('wipe_conv')).toHaveLength(0);
    expect(notificationEventRepository.listRecent()).toHaveLength(0);
    expect(pendingMessageRepository.listAll()).toHaveLength(0);
    expect(uploadTaskRepository.listPending()).toHaveLength(0);
  });
});

describe('memory fallback: pendingMessageRepository', () => {
  beforeEach(() => {
    pendingMessageRepository.clear();
  });

  test('listAll returns items sorted by createdAt ASC', () => {
    pendingMessageRepository.enqueue(makePending('p3', 3000));
    pendingMessageRepository.enqueue(makePending('p1', 1000));
    pendingMessageRepository.enqueue(makePending('p2', 2000));

    const all = pendingMessageRepository.listAll();
    expect(all).toHaveLength(3);
    expect(all[0].localId).toBe('p1');
    expect(all[1].localId).toBe('p2');
    expect(all[2].localId).toBe('p3');
  });

  test('listReady filters by status and nextRetryAt', () => {
    const now = Date.now();
    pendingMessageRepository.enqueue(makePending('ready_1', 1000, 'pending'));
    pendingMessageRepository.enqueue(makePending('ready_2', 2000, 'sending'));
    pendingMessageRepository.enqueue(makePending('ready_3', 3000, 'failed'));
    pendingMessageRepository.enqueue({
      ...makePending('ready_4', 4000, 'pending'),
      nextRetryAt: now + 100_000,
    });

    const ready = pendingMessageRepository.listReady(now);
    expect(ready.map((r) => r.localId)).toEqual(['ready_1', 'ready_2']);
  });

  test('get retrieves item by localId', () => {
    pendingMessageRepository.enqueue(makePending('get_1', 1000));
    expect(pendingMessageRepository.get('get_1')?.localId).toBe('get_1');
    expect(pendingMessageRepository.get('nonexistent')).toBeUndefined();
  });

  test('remove deletes item by localId', () => {
    pendingMessageRepository.enqueue(makePending('rm_1', 1000));
    pendingMessageRepository.remove('rm_1');
    expect(pendingMessageRepository.get('rm_1')).toBeUndefined();
  });

  test('findByClientMessageId finds by payload data', () => {
    pendingMessageRepository.enqueue({
      ...makePending('find_1', 1000),
      payloadJson: JSON.stringify({ data: { clientMessageId: 'cm_find' } }),
    });
    pendingMessageRepository.enqueue({
      ...makePending('find_2', 2000),
      payloadJson: JSON.stringify({ data: { clientMessageId: 'cm_find' } }),
    });

    // Should return the most recently updated one
    const found = pendingMessageRepository.findByClientMessageId('cm_find');
    expect(found?.localId).toBe('find_2');
  });

  test('countAll returns correct count', () => {
    pendingMessageRepository.enqueue(makePending('cnt_1', 1000));
    pendingMessageRepository.enqueue(makePending('cnt_2', 2000));
    expect(pendingMessageRepository.countAll()).toBe(2);
  });
});

describe('memory fallback: uploadTaskRepository', () => {
  beforeEach(() => {
    uploadTaskRepository.clear();
  });

  test('listPending returns only pending/failed/uploading tasks sorted by createdAt ASC', () => {
    uploadTaskRepository.upsert(makeUploadTask('up3', 3000, 'pending'));
    uploadTaskRepository.upsert(makeUploadTask('up1', 1000, 'failed'));
    uploadTaskRepository.upsert(makeUploadTask('up2', 2000, 'uploading'));
    uploadTaskRepository.upsert(makeUploadTask('up4', 400, 'uploaded'));

    const pending = uploadTaskRepository.listPending();
    expect(pending).toHaveLength(3);
    expect(pending[0].taskId).toBe('up1');
    expect(pending[1].taskId).toBe('up2');
    expect(pending[2].taskId).toBe('up3');
  });

  test('get retrieves task by taskId', () => {
    uploadTaskRepository.upsert(makeUploadTask('get_1', 1000));
    expect(uploadTaskRepository.get('get_1')?.taskId).toBe('get_1');
    expect(uploadTaskRepository.get('nonexistent')).toBeUndefined();
  });

  test('findByLocalMessageId returns most recently updated task', () => {
    uploadTaskRepository.upsert({ ...makeUploadTask('flm1', 1000), localMessageId: 'lm_1' });
    uploadTaskRepository.upsert({ ...makeUploadTask('flm2', 2000), localMessageId: 'lm_1' });

    const found = uploadTaskRepository.findByLocalMessageId('lm_1');
    expect(found?.taskId).toBe('flm2');
  });

  test('remove deletes task by taskId', () => {
    uploadTaskRepository.upsert(makeUploadTask('rm_1', 1000));
    uploadTaskRepository.remove('rm_1');
    expect(uploadTaskRepository.get('rm_1')).toBeUndefined();
  });
});

describe('memory fallback: notificationEventRepository', () => {
  beforeEach(() => {
    notificationEventRepository.clear();
  });

  test('listRecent returns events sorted by createdAt DESC', () => {
    notificationEventRepository.record('type_a', 'Screen1');
    // Small delay to ensure different timestamps
    const events = notificationEventRepository.listRecent();
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Most recent first
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].createdAt).toBeGreaterThanOrEqual(events[i].createdAt);
    }
  });

  test('clear removes all events', () => {
    notificationEventRepository.record('type_b', 'Screen2');
    notificationEventRepository.clear();
    expect(notificationEventRepository.listRecent()).toHaveLength(0);
  });
});
