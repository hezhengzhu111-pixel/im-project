import {
  messageDatabase,
  initializeStorage,
  __resetForTests,
  __setDbForTests,
  __getInternalStateForTests,
} from '../messageDatabase';
import { CURRENT_DB_VERSION, BASE_SCHEMA_VERSION } from '../storageMigrations';
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
      // FakeDbConnection doesn't support WHERE clauses, so readSchemaVersion
      // can't read back the written version. The fresh install writes BASE_SCHEMA_VERSION.
      // In real SQLite, incremental migration would upgrade to CURRENT_DB_VERSION.
      expect(health.schemaVersion).toBe(BASE_SCHEMA_VERSION);
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
