import { getAvailableMessageActions } from '../messageActions';
import type { Message } from '@im/shared-types';
import type { MessageActionContext } from '@/types/models';

const NOW = 1_740_000_000_000; // 2025-02-18 fixed timestamp

const baseMsg = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  senderId: 'u1',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'Hello',
  sendTime: new Date(NOW - 30_000).toISOString(),
  status: 'SENT',
  ...overrides,
});

const baseCtx = (overrides: Partial<MessageActionContext> = {}): MessageActionContext => ({
  currentUserId: 'u1',
  isGroupSession: false,
  now: NOW,
  recallWindowMs: 120_000,
  hasMediaUri: false,
  hasRemoteMediaUri: false,
  ...overrides,
});

const ids = (items: { id: string }[]) => items.map((i) => i.id);

// ─── copy ────────────────────────────────────────────────────────────────

describe('copy', () => {
  it('is available for TEXT messages with content', () => {
    const result = getAvailableMessageActions(baseMsg(), baseCtx());
    expect(ids(result)).toContain('copy');
    const a = result.find((r) => r.id === 'copy')!;
    expect(a.disabled).toBeFalsy();
  });

  it('is absent for TEXT messages without content', () => {
    const result = getAvailableMessageActions(
      baseMsg({ content: '' }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('copy');
  });

  it('is absent for non-TEXT messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'IMAGE', content: 'alt' }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('copy');
  });

  it('is absent for encrypted TEXT messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ encrypted: true }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('copy');
  });
});

// ─── retry ───────────────────────────────────────────────────────────────

describe('retry', () => {
  it('is available when status is FAILED', () => {
    const result = getAvailableMessageActions(
      baseMsg({ status: 'FAILED' }),
      baseCtx(),
    );
    expect(ids(result)).toContain('retry');
  });

  it('is available when sendStage is SEND_FAILED', () => {
    const result = getAvailableMessageActions(
      baseMsg(),
      baseCtx({ sendStage: 'SEND_FAILED' }),
    );
    expect(ids(result)).toContain('retry');
  });

  it('is available when sendStage is UPLOAD_FAILED', () => {
    const result = getAvailableMessageActions(
      baseMsg(),
      baseCtx({ sendStage: 'UPLOAD_FAILED' }),
    );
    expect(ids(result)).toContain('retry');
  });

  it('is available when ctx.messageStatus is FAILED', () => {
    const result = getAvailableMessageActions(
      baseMsg({ status: 'SENDING' }),
      baseCtx({ messageStatus: 'FAILED' }),
    );
    expect(ids(result)).toContain('retry');
  });

  it('is absent for normally sent messages', () => {
    const result = getAvailableMessageActions(baseMsg(), baseCtx());
    expect(ids(result)).not.toContain('retry');
  });
});

// ─── recall ──────────────────────────────────────────────────────────────

describe('recall', () => {
  it('is available for own SENT message within recall window', () => {
    const result = getAvailableMessageActions(baseMsg(), baseCtx());
    const r = result.find((a) => a.id === 'recall')!;
    expect(r).toBeDefined();
    expect(r.disabled).toBeFalsy();
  });

  it('is disabled when outside recall window', () => {
    const oldMsg = baseMsg({
      sendTime: new Date(NOW - 200_000).toISOString(),
    });
    const result = getAvailableMessageActions(oldMsg, baseCtx());
    const r = result.find((a) => a.id === 'recall')!;
    expect(r).toBeDefined();
    expect(r.disabled).toBe(true);
    expect(r.reason).toBe('超过撤回时限');
  });

  it('is absent for non-own messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ senderId: 'u2' }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('recall');
  });

  it('is absent for messages not in SENT state', () => {
    const result = getAvailableMessageActions(
      baseMsg({ status: 'SENDING' }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('recall');
  });

  it('is disabled for encrypted own messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ encrypted: true }),
      baseCtx(),
    );
    const r = result.find((a) => a.id === 'recall')!;
    expect(r).toBeDefined();
    expect(r.disabled).toBe(true);
    expect(r.reason).toBe('加密消息暂不支持撤回');
  });
});

// ─── deleteLocal ─────────────────────────────────────────────────────────

describe('deleteLocal', () => {
  it('is always available', () => {
    const cases: Partial<Message>[] = [
      {},
      { messageType: 'IMAGE' },
      { status: 'FAILED' },
      { status: 'RECALLED' },
      { encrypted: true },
      { senderId: 'u2' },
    ];
    for (const overrides of cases) {
      const result = getAvailableMessageActions(baseMsg(overrides), baseCtx());
      expect(ids(result)).toContain('deleteLocal');
    }
  });
});

// ─── saveMedia ───────────────────────────────────────────────────────────

describe('saveMedia', () => {
  it('is available for IMAGE with mediaUri', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'IMAGE', content: '' }),
      baseCtx({ hasMediaUri: true }),
    );
    expect(ids(result)).toContain('saveMedia');
  });

  it('is available for VIDEO with mediaUri', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'VIDEO', content: '' }),
      baseCtx({ hasMediaUri: true }),
    );
    expect(ids(result)).toContain('saveMedia');
  });

  it('is absent when both hasMediaUri and hasRemoteMediaUri are false', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'IMAGE', content: '' }),
      baseCtx({ hasMediaUri: false, hasRemoteMediaUri: false }),
    );
    expect(ids(result)).not.toContain('saveMedia');
  });

  it('is absent for non-media types', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'TEXT' }),
      baseCtx({ hasMediaUri: true }),
    );
    expect(ids(result)).not.toContain('saveMedia');
  });

  it('is available for remote IMAGE with hasRemoteMediaUri=true', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'IMAGE', content: '' }),
      baseCtx({ hasMediaUri: false, hasRemoteMediaUri: true }),
    );
    expect(ids(result)).toContain('saveMedia');
  });

  it('is available for remote VIDEO with hasRemoteMediaUri=true', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'VIDEO', content: '' }),
      baseCtx({ hasMediaUri: false, hasRemoteMediaUri: true }),
    );
    expect(ids(result)).toContain('saveMedia');
  });

  it('local IMAGE/VIDEO still shows Save', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'IMAGE', content: '' }),
      baseCtx({ hasMediaUri: true, hasRemoteMediaUri: true }),
    );
    expect(ids(result)).toContain('saveMedia');
  });
});

// ─── openFile ────────────────────────────────────────────────────────────

describe('openFile', () => {
  it('is available for FILE with mediaUri', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'FILE', content: '' }),
      baseCtx({ hasMediaUri: true }),
    );
    expect(ids(result)).toContain('openFile');
  });

  it('is available for remote FILE with hasRemoteMediaUri=true', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'FILE', content: '' }),
      baseCtx({ hasMediaUri: false, hasRemoteMediaUri: true }),
    );
    expect(ids(result)).toContain('openFile');
  });

  it('is absent when both hasMediaUri and hasRemoteMediaUri are false', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'FILE', content: '' }),
      baseCtx({ hasMediaUri: false, hasRemoteMediaUri: false }),
    );
    expect(ids(result)).not.toContain('openFile');
  });

  it('local FILE still shows Open file', () => {
    const result = getAvailableMessageActions(
      baseMsg({ messageType: 'FILE', content: '' }),
      baseCtx({ hasMediaUri: true, hasRemoteMediaUri: true }),
    );
    expect(ids(result)).toContain('openFile');
  });
});

// ─── readDetail ──────────────────────────────────────────────────────────

describe('readDetail', () => {
  it('is available for own SENT message', () => {
    const result = getAvailableMessageActions(baseMsg(), baseCtx());
    const r = result.find((a) => a.id === 'readDetail')!;
    expect(r).toBeDefined();
    expect(r.disabled).toBeFalsy();
  });

  it('is absent for non-own messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ senderId: 'u2' }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('readDetail');
  });

  it('is absent for non-SENT messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ status: 'SENDING' }),
      baseCtx(),
    );
    expect(ids(result)).not.toContain('readDetail');
  });

  it('is disabled for encrypted own messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ encrypted: true }),
      baseCtx(),
    );
    const r = result.find((a) => a.id === 'readDetail')!;
    expect(r).toBeDefined();
    expect(r.disabled).toBe(true);
    expect(r.reason).toBe('加密消息暂不支持查看详情');
  });
});

// ─── forward ─────────────────────────────────────────────────────────────

describe('forward', () => {
  it('is always present but disabled', () => {
    const result = getAvailableMessageActions(baseMsg(), baseCtx());
    const r = result.find((a) => a.id === 'forward')!;
    expect(r).toBeDefined();
    expect(r.disabled).toBe(true);
    expect(r.reason).toBe('转发功能即将推出');
  });
});

// ─── order stability ─────────────────────────────────────────────────────

describe('action order', () => {
  it('is stable across calls', () => {
    const a = ids(getAvailableMessageActions(baseMsg(), baseCtx()));
    const b = ids(getAvailableMessageActions(baseMsg(), baseCtx()));
    expect(a).toEqual(b);
  });

  it('matches expected canonical order', () => {
    // TEXT + own + SENT + no media → copy, recall, deleteLocal, readDetail, forward
    const result = getAvailableMessageActions(baseMsg(), baseCtx());
    expect(ids(result)).toEqual([
      'copy',
      'recall',
      'deleteLocal',
      'readDetail',
      'forward',
    ]);
  });

  it('includes retry before deleteLocal when failed', () => {
    const result = getAvailableMessageActions(
      baseMsg({ status: 'FAILED' }),
      baseCtx(),
    );
    const idx = {
      retry: ids(result).indexOf('retry'),
      deleteLocal: ids(result).indexOf('deleteLocal'),
    };
    expect(idx.retry).toBeLessThan(idx.deleteLocal);
  });
});

// ─── E2EE encrypted message full set ─────────────────────────────────────

describe('E2EE encrypted messages', () => {
  it('only exposes deleteLocal and forward for encrypted non-own text', () => {
    const result = getAvailableMessageActions(
      baseMsg({ encrypted: true, senderId: 'u2' }),
      baseCtx(),
    );
    expect(ids(result)).toEqual(['deleteLocal', 'forward']);
  });

  it('includes disabled recall/readDetail for encrypted own messages', () => {
    const result = getAvailableMessageActions(
      baseMsg({ encrypted: true }),
      baseCtx(),
    );
    expect(ids(result)).toContain('recall');
    expect(ids(result)).toContain('readDetail');
    expect(result.find((a) => a.id === 'recall')!.disabled).toBe(true);
    expect(result.find((a) => a.id === 'readDetail')!.disabled).toBe(true);
  });

  it('encrypted remote image still cannot copy but retains deleteLocal/forward', () => {
    const result = getAvailableMessageActions(
      baseMsg({ encrypted: true, messageType: 'IMAGE', content: 'alt', senderId: 'u2' }),
      baseCtx({ hasRemoteMediaUri: true }),
    );
    // 不能 copy（encrypted）
    expect(ids(result)).not.toContain('copy');
    // 可以 save（remote media）
    expect(ids(result)).toContain('saveMedia');
    // deleteLocal 始终可用
    expect(ids(result)).toContain('deleteLocal');
    // forward 始终可用（disabled）
    expect(ids(result)).toContain('forward');
  });
});

// ─── group session ───────────────────────────────────────────────────────

describe('group session', () => {
  it('does not change recall eligibility for own messages', () => {
    const result = getAvailableMessageActions(
      baseMsg(),
      baseCtx({ isGroupSession: true }),
    );
    expect(ids(result)).toContain('recall');
  });
});
