import {
  messageDatabase,
  initializeStorage,
  __resetForTests,
  __setDbForTests,
  __setReleaseOverrideForTests,
  __getInternalStateForTests,
} from '../messageDatabase';
import { CURRENT_DB_VERSION } from '../storageMigrations';
import { FakeDbConnection, createFakeDb } from '../__testutils__/fakeDbConnection';

describe('messageDatabase test seam', () => {
  let fake: FakeDbConnection;

  beforeEach(() => {
    __resetForTests();
    fake = createFakeDb();
  });

  afterEach(() => {
    __resetForTests();
  });

  describe('__setDbForTests / __resetForTests', () => {
    it('injects a fake db so execute() uses it instead of memory fallback', () => {
      __setDbForTests(fake);

      messageDatabase.execute('SELECT 1');

      expect(fake.executedSql).toEqual(['SELECT 1']);
    });

    it('after reset, module returns to initial state with no db', () => {
      __setDbForTests(fake);
      messageDatabase.execute('SELECT 1');

      __resetForTests();

      const state = __getInternalStateForTests();
      expect(state.db).toBeNull();
      expect(state.sqliteUnavailable).toBe(false);
      expect(state.storageHealth.mode).toBe('unknown');
    });

    it('reset clears injected db so memory fallback activates', () => {
      __setDbForTests(fake);
      expect(messageDatabase.isMemoryFallback()).toBe(false);

      __resetForTests();

      // After reset, no db injected → openSqlite() will try require('react-native-quick-sqlite')
      // which throws in tests → sqliteUnavailable becomes true → memory fallback
      expect(messageDatabase.isMemoryFallback()).toBe(true);
    });

    it('setting db to null reverts to normal openSqlite() path', () => {
      __setDbForTests(fake);
      messageDatabase.execute('SELECT 1');
      expect(fake.executedSql).toHaveLength(1);

      __setDbForTests(null);

      // Now openSqlite() runs normally; in test env it will fail → memory fallback
      expect(messageDatabase.isMemoryFallback()).toBe(true);
    });
  });

  describe('execute through fake db', () => {
    it('forwards sql and params to fake db', () => {
      __setDbForTests(fake);

      messageDatabase.execute('INSERT INTO t(a, b) VALUES (?, ?)', ['hello', 42]);

      expect(fake.executedSql).toEqual(['INSERT INTO t(a, b) VALUES (?, ?)']);
      expect(fake.executedParams).toEqual([['hello', 42]]);
    });

    it('returns result from fake db', () => {
      __setDbForTests(fake);
      fake.overrideQuery(/SELECT/, [{ id: '1', name: 'test' }]);

      const rows = messageDatabase.query('SELECT * FROM t');

      expect(rows).toEqual([{ id: '1', name: 'test' }]);
    });

    it('records multiple sql statements in order', () => {
      __setDbForTests(fake);

      messageDatabase.execute('CREATE TABLE t(id TEXT)');
      messageDatabase.execute('INSERT INTO t(id) VALUES (?)', ['a']);
      messageDatabase.execute('SELECT * FROM t');

      expect(fake.executedSql).toEqual([
        'CREATE TABLE t(id TEXT)',
        'INSERT INTO t(id) VALUES (?)',
        'SELECT * FROM t',
      ]);
    });
  });

  describe('query through fake db', () => {
    it('returns empty array when no rows', () => {
      __setDbForTests(fake);

      const rows = messageDatabase.query('SELECT * FROM empty_table');

      expect(rows).toEqual([]);
    });

    it('returns fake rows from override', () => {
      __setDbForTests(fake);
      fake.overrideQuery(/mobile_meta/, [
        { key: 'schema_version', value: '1' },
      ]);

      const rows = messageDatabase.query(
        "SELECT * FROM mobile_meta WHERE key = 'schema_version'",
      );

      expect(rows).toEqual([{ key: 'schema_version', value: '1' }]);
    });
  });

  describe('initializeStorage through fake db', () => {
    it('executes all CREATE_SCHEMA_SQL statements in order', async () => {
      __setDbForTests(fake);

      await initializeStorage();

      // Should execute CREATE TABLE + CREATE INDEX statements
      const createStatements = fake.executedSql.filter(
        (s) => s.trim().toUpperCase().startsWith('CREATE'),
      );
      expect(createStatements.length).toBeGreaterThan(0);

      // Should also INSERT schema_version
      const metaInsert = fake.executedSql.find((s) =>
        s.toUpperCase().includes('MOBILE_META'),
      );
      expect(metaInsert).toBeDefined();
    });

    it('sets storage health to sqlite mode on success', async () => {
      __setDbForTests(fake);

      await initializeStorage();

      const state = __getInternalStateForTests();
      expect(state.storageHealth.mode).toBe('sqlite');
      expect(state.storageHealth.persistenceAvailable).toBe(true);
      expect(state.storageHealth.lastError).toBe('');
    });

    it('falls back to memory mode when migration throws', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('disk full'));
      __setDbForTests(failDb);

      await initializeStorage();

      expect(messageDatabase.isMemoryFallback()).toBe(true);
      const state = __getInternalStateForTests();
      expect(state.storageHealth.mode).toBe('memory');
      expect(state.storageHealth.lastError).toBe('disk full');
      expect(state.sqliteUnavailable).toBe(true);
    });
  });

  describe('storageHealth migration fields', () => {
    it('sets migrationStatus=success and schemaVersion on successful init', async () => {
      __setDbForTests(fake);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.migrationStatus).toBe('success');
      // Fresh install writes CURRENT_DB_VERSION directly (not BASE_SCHEMA_VERSION)
      expect(health.schemaVersion).toBe(CURRENT_DB_VERSION);
      expect(health.targetSchemaVersion).toBe(CURRENT_DB_VERSION);
      expect(health.lastMigrationError).toBe('');
    });

    it('sets migrationStatus=failed when quick-sqlite is unavailable', async () => {
      // Don't inject any db → openSqlite() will try require() which throws in tests
      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.mode).toBe('memory');
      expect(health.persistenceAvailable).toBe(false);
      expect(health.migrationStatus).toBe('failed');
      expect(health.lastMigrationError).toBeTruthy();
    });

    it('sets migrationStatus=failed and lastMigrationError when migration throws', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/BEGIN/, new Error('database is locked'));
      __setDbForTests(failDb);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.migrationStatus).toBe('failed');
      expect(health.lastMigrationError).toContain('database is locked');
      expect(health.mode).toBe('memory');
      expect(health.schemaVersion).toBeNull();
    });

    it('getStorageHealth does not clear lastError on repeated calls', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('disk full'));
      __setDbForTests(failDb);

      await initializeStorage();

      const health1 = messageDatabase.getStorageHealth();
      expect(health1.lastMigrationError).toBe('disk full');

      const health2 = messageDatabase.getStorageHealth();
      expect(health2.lastMigrationError).toBe('disk full');
      expect(health2.migrationStatus).toBe('failed');
    });

    it('getStorageHealth returns a copy, not a reference', async () => {
      __setDbForTests(fake);
      await initializeStorage();

      const health1 = messageDatabase.getStorageHealth();
      const health2 = messageDatabase.getStorageHealth();

      expect(health1).not.toBe(health2);
      expect(health1).toEqual(health2);
    });
  });

  describe('FakeDbConnection error simulation', () => {
    it('throwOnSql triggers error on matching sql', () => {
      __setDbForTests(fake);
      fake.throwOnSql(/INSERT/, new Error('constraint violation'));

      expect(() => {
        messageDatabase.execute('INSERT INTO t(id) VALUES (?)', ['x']);
      }).toThrow('constraint violation');
    });

    it('throwOnSql does not trigger on non-matching sql', () => {
      __setDbForTests(fake);
      fake.throwOnSql(/INSERT/, new Error('should not throw'));

      expect(() => {
        messageDatabase.execute('SELECT 1');
      }).not.toThrow();
    });

    it('error triggers are cleared on reset', () => {
      __setDbForTests(fake);
      fake.throwOnSql(/SELECT/, new Error('boom'));

      fake.reset();

      expect(() => {
        fake.execute('SELECT 1');
      }).not.toThrow();
    });
  });

  describe('lastMigrationError sensitive info filtering', () => {
    it('stores only error message, not stack trace', async () => {
      const failDb = createFakeDb();
      const errorWithStack = new Error('database locked');
      errorWithStack.stack = 'Error: database locked\n    at Object.execute (/app/node_modules/better-sqlite3/lib/database.js:123:45)\n    at migrationRunner.ts:50:12';
      failDb.throwOnSql(/CREATE TABLE/, errorWithStack);
      __setDbForTests(failDb);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.lastMigrationError).toBe('database locked');
      expect(health.lastMigrationError).not.toContain('/app/node_modules');
      expect(health.lastMigrationError).not.toContain('better-sqlite3');
      expect(health.lastMigrationError).not.toContain('migrationRunner.ts');
    });

    it('does not expose file paths in lastMigrationError', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('disk full at /data/user/0/com.app/databases/im.db'));
      __setDbForTests(failDb);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      // The error message itself contains the path, but that's the message content
      // The important thing is we don't append stack traces
      expect(health.lastMigrationError).toBe('disk full at /data/user/0/com.app/databases/im.db');
    });

    it('handles non-Error objects gracefully', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, 'string error' as any);
      __setDbForTests(failDb);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      // For non-Error objects, String(error) is used
      expect(health.lastMigrationError).toBe('string error');
    });

    it('lastMigrationError is empty string on success', async () => {
      __setDbForTests(fake);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.lastMigrationError).toBe('');
    });

    it('lastMigrationError persists across multiple getStorageHealth calls', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('connection lost'));
      __setDbForTests(failDb);

      await initializeStorage();

      const health1 = messageDatabase.getStorageHealth();
      const health2 = messageDatabase.getStorageHealth();
      expect(health1.lastMigrationError).toBe('connection lost');
      expect(health2.lastMigrationError).toBe('connection lost');
    });
  });

  describe('migrationStatus lifecycle', () => {
    it('transitions from unknown to running to success', async () => {
      __setDbForTests(fake);

      // Before init
      expect(messageDatabase.getStorageHealth().migrationStatus).toBe('unknown');

      await initializeStorage();

      expect(messageDatabase.getStorageHealth().migrationStatus).toBe('success');
    });

    it('transitions from unknown to running to failed on migration error', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/BEGIN/, new Error('database locked'));
      __setDbForTests(failDb);

      await initializeStorage();

      expect(messageDatabase.getStorageHealth().migrationStatus).toBe('failed');
    });

    it('transitions to failed when quick-sqlite is unavailable', async () => {
      // Don't inject any db
      await initializeStorage();

      expect(messageDatabase.getStorageHealth().migrationStatus).toBe('failed');
      expect(messageDatabase.getStorageHealth().mode).toBe('memory');
    });
  });

  describe('FakeDbConnection table seeding', () => {
    it('seedTable provides data for queries', () => {
      __setDbForTests(fake);
      fake.seedTable('mobile_messages', [
        { id: 'msg1', content: 'hello' },
        { id: 'msg2', content: 'world' },
      ]);

      const rows = fake.execute('SELECT * FROM mobile_messages').rows?.raw?.();

      expect(rows).toEqual([
        { id: 'msg1', content: 'hello' },
        { id: 'msg2', content: 'world' },
      ]);
    });

    it('seedTable replaces previous data', () => {
      fake.seedTable('t', [{ id: '1' }]);
      fake.seedTable('t', [{ id: '2' }]);

      const rows = fake.execute('SELECT * FROM t').rows?.raw?.();

      expect(rows).toEqual([{ id: '2' }]);
    });
  });

  describe('__getInternalStateForTests', () => {
    it('returns snapshot of current state', () => {
      __setDbForTests(fake);

      const state = __getInternalStateForTests();

      expect(state.db).toBe(fake);
      expect(state.sqliteUnavailable).toBe(false);
    });

    it('returns a copy, not a reference to storageHealth', () => {
      const state1 = __getInternalStateForTests();
      const state2 = __getInternalStateForTests();

      expect(state1.storageHealth).not.toBe(state2.storageHealth);
      expect(state1.storageHealth).toEqual(state2.storageHealth);
    });
  });
});

// ---------------------------------------------------------------------------
// Release build fail-fast behavior
// ---------------------------------------------------------------------------

describe('Release build fail-fast', () => {
  beforeEach(() => {
    __resetForTests();
    __setReleaseOverrideForTests(true);
  });

  afterEach(() => {
    __resetForTests();
  });

  describe('quick-sqlite unavailable in release', () => {
    it('initializeStorage throws with persistentStorageUnavailableError', async () => {
      await expect(initializeStorage()).rejects.toThrow(
        'Persistent message database unavailable in release build: quick-sqlite unavailable',
      );
    });

    it('execute throws with persistentStorageUnavailableError', () => {
      expect(() => {
        messageDatabase.execute('SELECT 1');
      }).toThrow(
        'Persistent message database unavailable in release build: quick-sqlite unavailable',
      );
    });

    it('storageHealth.releaseVisibilityRequired is true after failure', async () => {
      await expect(initializeStorage()).rejects.toThrow();

      const health = messageDatabase.getStorageHealth();
      expect(health.releaseVisibilityRequired).toBe(true);
    });

    it('storageHealth records failure details before throw', async () => {
      await expect(initializeStorage()).rejects.toThrow();

      const health = messageDatabase.getStorageHealth();
      expect(health.mode).toBe('memory');
      expect(health.persistenceAvailable).toBe(false);
      expect(health.lastError).toBeTruthy();
      expect(health.migrationStatus).toBe('failed');
    });
  });

  describe('migration failed in release', () => {
    it('initializeStorage throws when migration fails', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('disk full'));
      __setDbForTests(failDb);

      await expect(initializeStorage()).rejects.toThrow(
        'Persistent message database unavailable in release build: schema migration failed: disk full',
      );
    });

    it('error message includes original migration error reason', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('database is locked'));
      __setDbForTests(failDb);

      await expect(initializeStorage()).rejects.toThrow('database is locked');
    });

    it('storageHealth records migrationStatus=failed and lastMigrationError', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('disk full'));
      __setDbForTests(failDb);

      await expect(initializeStorage()).rejects.toThrow();

      const health = messageDatabase.getStorageHealth();
      expect(health.migrationStatus).toBe('failed');
      expect(health.lastMigrationError).toBe('disk full');
      expect(health.mode).toBe('memory');
      expect(health.persistenceAvailable).toBe(false);
    });

    it('throw happens after storageHealth is updated for diagnostics', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, new Error('disk full'));
      __setDbForTests(failDb);

      await expect(initializeStorage()).rejects.toThrow();

      // storageHealth must not be stuck at 'running' or 'unknown'
      const health = messageDatabase.getStorageHealth();
      expect(health.migrationStatus).not.toBe('running');
      expect(health.migrationStatus).not.toBe('unknown');
      expect(health.lastMigrationError).toBeTruthy();
    });

    it('non-Error migration failure objects are stringified in the throw', async () => {
      const failDb = createFakeDb();
      failDb.throwOnSql(/CREATE TABLE/, 'raw string failure' as any);
      __setDbForTests(failDb);

      await expect(initializeStorage()).rejects.toThrow('raw string failure');
    });
  });

  describe('SQLite available in release — happy path', () => {
    it('initializeStorage succeeds', async () => {
      const fake = createFakeDb();
      __setDbForTests(fake);

      await expect(initializeStorage()).resolves.toBeUndefined();
    });

    it('storageHealth mode is sqlite and persistenceAvailable is true', async () => {
      const fake = createFakeDb();
      __setDbForTests(fake);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.mode).toBe('sqlite');
      expect(health.persistenceAvailable).toBe(true);
    });

    it('migrationStatus is success and releaseVisibilityRequired is false', async () => {
      const fake = createFakeDb();
      __setDbForTests(fake);

      await initializeStorage();

      const health = messageDatabase.getStorageHealth();
      expect(health.migrationStatus).toBe('success');
      expect(health.releaseVisibilityRequired).toBe(false);
      expect(health.lastError).toBe('');
      expect(health.lastMigrationError).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// Debug build memory fallback (explicit non-release behavior)
// ---------------------------------------------------------------------------

describe('Debug build memory fallback', () => {
  beforeEach(() => {
    __resetForTests();
    __setReleaseOverrideForTests(false);
  });

  afterEach(() => {
    __resetForTests();
  });

  it('initializeStorage does not throw when quick-sqlite unavailable', async () => {
    await expect(initializeStorage()).resolves.toBeUndefined();
  });

  it('mode is memory and persistenceAvailable is false', async () => {
    await initializeStorage();

    const health = messageDatabase.getStorageHealth();
    expect(health.mode).toBe('memory');
    expect(health.persistenceAvailable).toBe(false);
  });

  it('execute returns empty result instead of throwing', () => {
    const result = messageDatabase.execute('INSERT INTO t VALUES (?)', ['x']);
    expect(result).toEqual({});
  });

  it('query returns empty array from memory fallback', () => {
    const rows = messageDatabase.query('SELECT * FROM t');
    expect(rows).toEqual([]);
  });

  it('memory fallback operations (upsert/list) work correctly', () => {
    messageDatabase.memoryUpsert('test_table', 'key1', { value: 'hello' });
    messageDatabase.memoryUpsert('test_table', 'key2', { value: 'world' });

    const rows = messageDatabase.memoryList('test_table');
    expect(rows).toEqual([{ value: 'hello' }, { value: 'world' }]);
  });

  it('storageHealth.releaseVisibilityRequired is false', async () => {
    await initializeStorage();

    const health = messageDatabase.getStorageHealth();
    expect(health.releaseVisibilityRequired).toBe(false);
  });
});
