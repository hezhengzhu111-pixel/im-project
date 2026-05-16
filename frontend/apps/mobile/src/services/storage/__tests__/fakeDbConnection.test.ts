import { createFakeDb, FakeDbConnection } from '../__testutils__/fakeDbConnection';

describe('FakeDbConnection – WHERE / ORDER BY / LIMIT parameterised queries', () => {
  let db: FakeDbConnection;

  beforeEach(() => {
    db = createFakeDb();
    db.seedTable('mobile_messages', [
      { id: 'msg1', conversationId: 'convA', sendTime: '2026-05-10T10:00:00Z', content: 'first', serverId: 's1', clientMessageId: 'c1' },
      { id: 'msg2', conversationId: 'convA', sendTime: '2026-05-10T11:00:00Z', content: 'second', serverId: 's2', clientMessageId: 'c2' },
      { id: 'msg3', conversationId: 'convA', sendTime: '2026-05-10T12:00:00Z', content: 'third', serverId: 's3', clientMessageId: 'c3' },
      { id: 'msg4', conversationId: 'convB', sendTime: '2026-05-10T10:30:00Z', content: 'other conv', serverId: 's4', clientMessageId: 'c4' },
      { id: 'msg5', conversationId: 'convA', sendTime: '2026-05-10T13:00:00Z', content: 'fourth', serverId: 's5', clientMessageId: 'c5' },
    ]);
  });

  it('filters by conversationId = ?', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ?',
      ['convA'],
    ).rows!.raw!();

    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.conversationId === 'convA')).toBe(true);
  });

  it('filters by sendTime < ?', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? AND sendTime < ?',
      ['convA', '2026-05-10T11:00:00Z'],
    ).rows!.raw!();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('msg1');
  });

  it('filters by sendTime > ?', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? AND sendTime > ?',
      ['convA', '2026-05-10T11:00:00Z'],
    ).rows!.raw!();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(['msg3', 'msg5']));
  });

  it('ORDER BY sendTime DESC', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? ORDER BY sendTime DESC',
      ['convA'],
    ).rows!.raw!();

    expect(rows).toHaveLength(4);
    expect(rows[0].id).toBe('msg5');
    expect(rows[1].id).toBe('msg3');
    expect(rows[2].id).toBe('msg2');
    expect(rows[3].id).toBe('msg1');
  });

  it('ORDER BY sendTime ASC', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? ORDER BY sendTime ASC',
      ['convA'],
    ).rows!.raw!();

    expect(rows).toHaveLength(4);
    expect(rows[0].id).toBe('msg1');
    expect(rows[1].id).toBe('msg2');
    expect(rows[2].id).toBe('msg3');
    expect(rows[3].id).toBe('msg5');
  });

  it('LIMIT ? parameterised', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? ORDER BY sendTime DESC LIMIT ?',
      ['convA', 2],
    ).rows!.raw!();

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('msg5');
    expect(rows[1].id).toBe('msg3');
  });

  it('OR conditions match id / serverId / clientMessageId', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? AND (id = ? OR serverId = ? OR clientMessageId = ?)',
      ['convA', 'msg3', 'nonexistent', 'c1'],
    ).rows!.raw!();

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('msg3');
    expect(ids).toContain('msg1');
  });

  it('multi-params consume in order, not all from params[0]', () => {
    // msg1 sendTime=10:00, msg2=11:00, msg3=12:00, msg5=13:00
    // query: >11:00 AND <13:00 → only msg3 (12:00)
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? AND sendTime > ? AND sendTime < ?',
      ['convA', '2026-05-10T11:00:00Z', '2026-05-10T13:00:00Z'],
    ).rows!.raw!();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('msg3');
  });

  it('full pagination query: WHERE + ORDER BY DESC + LIMIT with paramised values', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? ORDER BY sendTime DESC LIMIT ?',
      ['convA', 3],
    ).rows!.raw!();

    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('msg5');
    expect(rows[1].id).toBe('msg3');
    expect(rows[2].id).toBe('msg2');
  });

  it('cursor pagination: WHERE + sendTime < ? + ORDER BY DESC + LIMIT ?', () => {
    const rows = db.execute(
      'SELECT * FROM mobile_messages WHERE conversationId = ? AND sendTime < ? ORDER BY sendTime DESC LIMIT ?',
      ['convA', '2026-05-10T12:00:00Z', 2],
    ).rows!.raw!();

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('msg2');
    expect(rows[1].id).toBe('msg1');
  });
});
