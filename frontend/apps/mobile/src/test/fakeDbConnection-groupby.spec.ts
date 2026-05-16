/**
 * Verification test for FakeDbConnection GROUP BY support.
 */
import { createFakeDb } from '@/services/storage/__testutils__/fakeDbConnection';

describe('FakeDbConnection GROUP BY', () => {
  let db: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    db = createFakeDb();
    db.seedTable('mobile_pending_messages', [
      { localId: 'p1', conversationId: 'conv-1', status: 'pending', createdAt: 100 },
      { localId: 'p2', conversationId: 'conv-1', status: 'sending', createdAt: 200 },
      { localId: 'p3', conversationId: 'conv-2', status: 'pending', createdAt: 300 },
      { localId: 'p4', conversationId: 'conv-2', status: 'failed', createdAt: 400 },
      { localId: 'p5', conversationId: 'conv-2', status: 'pending', createdAt: 500 },
      { localId: 'p6', conversationId: 'conv-3', status: 'blocked', createdAt: 600 },
    ]);
  });

  it('COUNT(*) with GROUP BY should return per-group counts', () => {
    const result = db.execute(
      "SELECT status, COUNT(*) AS cnt FROM mobile_pending_messages GROUP BY status",
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(4);

    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.cnt]));
    expect(byStatus.pending).toBe(3);
    expect(byStatus.sending).toBe(1);
    expect(byStatus.failed).toBe(1);
    expect(byStatus.blocked).toBe(1);
  });

  it('COUNT(*) with GROUP BY and WHERE should filter then group', () => {
    const result = db.execute(
      "SELECT status, COUNT(*) AS cnt FROM mobile_pending_messages WHERE conversationId = ? GROUP BY status",
      ['conv-2'],
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(2);

    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.cnt]));
    expect(byStatus.pending).toBe(2);
    expect(byStatus.failed).toBe(1);
  });

  it('SELECT * with GROUP BY should return one row per group', () => {
    const result = db.execute(
      "SELECT * FROM mobile_pending_messages GROUP BY conversationId",
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(3); // conv-1, conv-2, conv-3
    const convIds = rows.map((r) => r.conversationId).sort();
    expect(convIds).toEqual(['conv-1', 'conv-2', 'conv-3']);
  });

  it('GROUP BY with ORDER BY should combine correctly', () => {
    const result = db.execute(
      "SELECT status, COUNT(*) AS cnt FROM mobile_pending_messages GROUP BY status ORDER BY cnt DESC",
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows[0].status).toBe('pending');
    expect(rows[0].cnt).toBe(3);
  });

  it('GROUP BY with no matching WHERE rows should return empty', () => {
    const result = db.execute(
      "SELECT status, COUNT(*) AS cnt FROM mobile_pending_messages WHERE conversationId = ? GROUP BY status",
      ['nonexistent'],
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(0);
  });

  it('WHERE on status column should work with string param', () => {
    const result = db.execute(
      "SELECT * FROM mobile_pending_messages WHERE status = ?",
      ['pending'],
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('WHERE on conversationId column should work with string param', () => {
    const result = db.execute(
      "SELECT * FROM mobile_pending_messages WHERE conversationId = ?",
      ['conv-1'],
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.conversationId === 'conv-1')).toBe(true);
  });

  it('ORDER BY createdAt ASC should sort ascending', () => {
    const result = db.execute(
      "SELECT * FROM mobile_pending_messages ORDER BY createdAt ASC",
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(6);
    for (let i = 1; i < rows.length; i++) {
      expect(Number(rows[i].createdAt)).toBeGreaterThanOrEqual(Number(rows[i - 1].createdAt));
    }
  });

  it('ORDER BY updatedAt DESC should sort descending', () => {
    db.seedTable('mobile_upload_tasks', [
      { taskId: 'u1', updatedAt: 1000 },
      { taskId: 'u2', updatedAt: 3000 },
      { taskId: 'u3', updatedAt: 2000 },
    ]);
    const result = db.execute(
      "SELECT * FROM mobile_upload_tasks ORDER BY updatedAt DESC",
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0].taskId).toBe('u2');
    expect(rows[1].taskId).toBe('u3');
    expect(rows[2].taskId).toBe('u1');
  });

  it('WHERE status IN (...) should filter correctly', () => {
    const result = db.execute(
      "SELECT * FROM mobile_pending_messages WHERE status IN ('pending', 'sending')",
    );
    const rows = result.rows?.raw?.() ?? [];
    expect(rows).toHaveLength(4); // 3 pending + 1 sending
  });
});
