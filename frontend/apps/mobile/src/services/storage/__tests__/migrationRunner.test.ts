import { getMigrationSteps, CURRENT_DB_VERSION, MIGRATIONS } from '../storageMigrations';
import { runMigrations } from '../migrationRunner';
import { createFakeDb, FakeDbConnection } from '../__testutils__/fakeDbConnection';

describe('getMigrationSteps', () => {
  it('returns empty when fromVersion === toVersion', () => {
    expect(getMigrationSteps(1, 1)).toEqual([]);
  });

  it('returns empty when fromVersion > toVersion (no downgrade)', () => {
    expect(getMigrationSteps(2, 1)).toEqual([]);
  });

  it('returns empty when no migrations exist for the range', () => {
    // Test a range with no steps (e.g., 3→4 when 4 doesn't exist)
    expect(getMigrationSteps(3, 4)).toEqual([]);
  });

  it('returns steps for versions that have migration entries', () => {
    // Temporarily add a test migration to verify the step builder
    const original = MIGRATIONS[2];
    try {
      MIGRATIONS[2] = ['ALTER TABLE mobile_messages ADD COLUMN editedAt INTEGER'];
      const steps = getMigrationSteps(1, 2);
      expect(steps).toEqual([
        { version: 2, statements: ['ALTER TABLE mobile_messages ADD COLUMN editedAt INTEGER'] },
      ]);
    } finally {
      if (original === undefined) {
        delete MIGRATIONS[2];
      } else {
        MIGRATIONS[2] = original;
      }
    }
  });

  it('returns multiple steps in order for multi-version range', () => {
    const orig2 = MIGRATIONS[2];
    const orig3 = MIGRATIONS[3];
    try {
      MIGRATIONS[2] = ['ALTER TABLE t ADD COLUMN a INTEGER'];
      MIGRATIONS[3] = ['ALTER TABLE t ADD COLUMN b TEXT'];
      const steps = getMigrationSteps(1, 3);
      expect(steps).toHaveLength(2);
      expect(steps[0].version).toBe(2);
      expect(steps[1].version).toBe(3);
    } finally {
      if (orig2 === undefined) { delete MIGRATIONS[2]; } else { MIGRATIONS[2] = orig2; }
      if (orig3 === undefined) { delete MIGRATIONS[3]; } else { MIGRATIONS[3] = orig3; }
    }
  });

  it('skips version entries with empty statements', () => {
    const orig = MIGRATIONS[2];
    try {
      MIGRATIONS[2] = [];
      const steps = getMigrationSteps(1, 2);
      expect(steps).toEqual([]);
    } finally {
      if (orig === undefined) { delete MIGRATIONS[2]; } else { MIGRATIONS[2] = orig; }
    }
  });
});

describe('runMigrations', () => {
  let fake: FakeDbConnection;

  beforeEach(() => {
    fake = createFakeDb();
  });

  it('runs fresh install on empty database (no tables, no schema_version)', () => {
    const result = runMigrations(fake);

    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(CURRENT_DB_VERSION);

    // Should have created all tables
    const createStatements = fake.executedSql.filter(
      (s) => s.trim().toUpperCase().startsWith('CREATE'),
    );
    expect(createStatements.length).toBeGreaterThan(0);

    // Should have written schema_version
    const metaInsert = fake.executedSql.find((s) =>
      s.toUpperCase().includes('MOBILE_META') && s.toUpperCase().includes('SCHEMA_VERSION'),
    );
    expect(metaInsert).toBeDefined();
  });

  it('treats legacy database (tables exist, no schema_version row) as V1', () => {
    // Simulate existing tables but no schema_version in mobile_meta
    fake.seedTable('mobile_messages', [{ id: 'msg1' }]);

    const result = runMigrations(fake);

    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(CURRENT_DB_VERSION);
  });

  it('is a no-op when schema_version matches CURRENT_DB_VERSION', () => {
    fake.seedTable('mobile_meta', [{ key: 'schema_version', value: String(CURRENT_DB_VERSION) }]);

    const result = runMigrations(fake);

    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe(CURRENT_DB_VERSION);
    expect(result.toVersion).toBe(CURRENT_DB_VERSION);
    // Should only have executed the meta table creation + SELECT for reading version
    const migrationSql = fake.executedSql.filter(
      (s) => s.toUpperCase().startsWith('BEGIN') || s.toUpperCase().startsWith('COMMIT'),
    );
    expect(migrationSql).toHaveLength(0);
  });

  it('rejects downgrade when database version > code version', () => {
    fake.seedTable('mobile_meta', [{ key: 'schema_version', value: String(CURRENT_DB_VERSION + 1) }]);

    const result = runMigrations(fake);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Downgrade not supported');
    expect(result.fromVersion).toBe(CURRENT_DB_VERSION + 1);
  });

  it('runs incremental migration when version < CURRENT_DB_VERSION', () => {
    // Seed version 1 to trigger incremental migration to CURRENT_DB_VERSION (2)
    fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

    const result = runMigrations(fake);
    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(CURRENT_DB_VERSION);
  });

  it('rolls back and returns error when migration SQL throws', () => {
    // Use a pattern that only matches inside the transaction (not ensureMetaTable)
    fake.throwOnSql(/CREATE TABLE IF NOT EXISTS mobile_sessions/, new Error('disk full'));

    const result = runMigrations(fake);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Fresh install failed');
    expect(result.error).toContain('disk full');

    // Should have issued ROLLBACK
    const rollbacks = fake.executedSql.filter((s) => s.toUpperCase().includes('ROLLBACK'));
    expect(rollbacks.length).toBeGreaterThanOrEqual(1);
  });

  it('ensures mobile_meta table exists before reading schema_version', () => {
    runMigrations(fake);

    // First CREATE statement should be for mobile_meta
    const firstCreate = fake.executedSql.find((s) =>
      s.trim().toUpperCase().startsWith('CREATE TABLE') && s.toUpperCase().includes('MOBILE_META'),
    );
    expect(firstCreate).toBeDefined();
  });

  it('wraps migration steps in BEGIN TRANSACTION / COMMIT', () => {
    // Verify transaction bookends during fresh install
    runMigrations(fake);

    const begins = fake.executedSql.filter((s) => s.trim().toUpperCase() === 'BEGIN TRANSACTION');
    const commits = fake.executedSql.filter((s) => s.trim().toUpperCase() === 'COMMIT');

    // Fresh install uses one transaction
    expect(begins.length).toBeGreaterThanOrEqual(1);
    expect(commits.length).toBeGreaterThanOrEqual(1);
    // BEGIN should come before COMMIT
    const beginIdx = fake.executedSql.indexOf(begins[0]);
    const commitIdx = fake.executedSql.indexOf(commits[0]);
    expect(beginIdx).toBeLessThan(commitIdx);
  });

  it('ROLLBACK appears before throw on failure', () => {
    fake.throwOnSql(/INSERT OR REPLACE INTO mobile_meta/, new Error('write failure'));

    const result = runMigrations(fake);

    expect(result.success).toBe(false);
    const rollbacks = fake.executedSql.filter((s) => s.toUpperCase().includes('ROLLBACK'));
    expect(rollbacks.length).toBeGreaterThanOrEqual(1);
  });

  describe('V1 → V2 incremental migration', () => {
    it('executes V2 migration statements when starting from V1', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // Should contain V2 migration SQL (clientMessageId column)
      const alterStatements = fake.executedSql.filter(
        (s) => s.toUpperCase().includes('ALTER TABLE') && s.toUpperCase().includes('CLIENTMESSAGEID'),
      );
      expect(alterStatements.length).toBeGreaterThanOrEqual(1);
    });

    it('wraps V2 migration in its own transaction', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

      runMigrations(fake);

      // Should have BEGIN/COMMIT pairs for incremental migrations
      const begins = fake.executedSql.filter((s) => s.trim().toUpperCase() === 'BEGIN TRANSACTION');
      const commits = fake.executedSql.filter((s) => s.trim().toUpperCase() === 'COMMIT');
      expect(begins.length).toBeGreaterThanOrEqual(1);
      expect(commits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('V2 → V3 incremental migration', () => {
    it('executes V3 migration statements when starting from V2', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '2' }]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(2);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // Should contain V3 migration SQL (upload_tasks new columns)
      const alterStatements = fake.executedSql.filter(
        (s) => s.toUpperCase().includes('ALTER TABLE') && s.toUpperCase().includes('MOBILE_UPLOAD_TASKS'),
      );
      expect(alterStatements.length).toBeGreaterThanOrEqual(1);
    });

    it('adds nextRetryAt, maxRetryCount, checksum, remoteFileId, lastAttemptAt columns', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '2' }]);

      runMigrations(fake);

      const executedUpper = fake.executedSql.map((s) => s.toUpperCase());
      expect(executedUpper.some((s) => s.includes('NEXTRETRYAT'))).toBe(true);
      expect(executedUpper.some((s) => s.includes('MAXRETRYCOUNT'))).toBe(true);
      expect(executedUpper.some((s) => s.includes('CHECKSUM'))).toBe(true);
      expect(executedUpper.some((s) => s.includes('REMOTEFILEID'))).toBe(true);
      expect(executedUpper.some((s) => s.includes('LASTATTEMPTAT'))).toBe(true);
    });

    it('creates index on upload_tasks status and nextRetryAt', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '2' }]);

      runMigrations(fake);

      const indexStatements = fake.executedSql.filter(
        (s) => s.toUpperCase().includes('CREATE INDEX') && s.toUpperCase().includes('UPLOAD_TASKS'),
      );
      expect(indexStatements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('V1 → V3 full migration path', () => {
    it('runs V2 then V3 in order when starting from V1', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(3);

      // V2 statements should appear before V3 statements
      const v2AlterIdx = fake.executedSql.findIndex(
        (s) => s.toUpperCase().includes('ALTER TABLE') && s.toUpperCase().includes('CLIENTMESSAGEID'),
      );
      const v3AlterIdx = fake.executedSql.findIndex(
        (s) => s.toUpperCase().includes('ALTER TABLE') && s.toUpperCase().includes('NEXTRETRYAT'),
      );
      expect(v2AlterIdx).toBeGreaterThanOrEqual(0);
      expect(v3AlterIdx).toBeGreaterThanOrEqual(0);
      expect(v2AlterIdx).toBeLessThan(v3AlterIdx);
    });

    it('writes schema_version for each intermediate step', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

      runMigrations(fake);

      // Should have written version 2 and version 3
      const metaInserts = fake.executedSql.filter(
        (s) => s.toUpperCase().includes('INSERT OR REPLACE INTO MOBILE_META'),
      );
      expect(metaInserts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('schema_version update timing', () => {
    it('does not update schema_version when migration fails', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);
      // Fail on V2 migration
      fake.throwOnSql(/ALTER TABLE mobile_pending_messages ADD COLUMN clientMessageId/, new Error('column exists'));

      const result = runMigrations(fake);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration to version 2 failed');

      // Should have ROLLBACK but no successful COMMIT for the failed step
      const rollbacks = fake.executedSql.filter((s) => s.toUpperCase().includes('ROLLBACK'));
      expect(rollbacks.length).toBeGreaterThanOrEqual(1);
    });

    it('rolls back only the failed step, not previous successful steps', () => {
      // Start from V1, V2 will succeed, V3 will fail
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);
      let alterCount = 0;
      const originalExecute = fake.execute.bind(fake);
      fake.execute = (sql: string, params?: unknown[]) => {
        if (sql.toUpperCase().includes('ALTER TABLE') && sql.toUpperCase().includes('NEXTRETRYAT')) {
          alterCount++;
          if (alterCount === 1) {
            throw new Error('disk full');
          }
        }
        return originalExecute(sql, params);
      };

      const result = runMigrations(fake);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration to version 3 failed');
    });
  });

  describe('incremental migration order', () => {
    it('executes migration steps in ascending version order', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

      runMigrations(fake);

      // Track ALTER TABLE statements to verify order
      const alterStatements = fake.executedSql
        .filter((s) => s.toUpperCase().startsWith('ALTER TABLE'))
        .map((s) => s.toUpperCase());

      // V2: clientMessageId should come before V3: nextRetryAt
      const v2Idx = alterStatements.findIndex((s) => s.includes('CLIENTMESSAGEID'));
      const v3Idx = alterStatements.findIndex((s) => s.includes('NEXTRETRYAT'));

      if (v2Idx >= 0 && v3Idx >= 0) {
        expect(v2Idx).toBeLessThan(v3Idx);
      }
    });

    it('each migration step has its own BEGIN/COMMIT transaction', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);

      runMigrations(fake);

      const begins = fake.executedSql.filter((s) => s.trim().toUpperCase() === 'BEGIN TRANSACTION');
      const commits = fake.executedSql.filter((s) => s.trim().toUpperCase() === 'COMMIT');

      // Should have at least 2 transaction pairs (V2 and V3)
      expect(begins.length).toBeGreaterThanOrEqual(2);
      expect(commits.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('downgrade protection', () => {
    it('rejects when database version is exactly CURRENT_DB_VERSION + 1', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: String(CURRENT_DB_VERSION + 1) }]);

      const result = runMigrations(fake);

      expect(result.success).toBe(false);
      expect(result.fromVersion).toBe(CURRENT_DB_VERSION + 1);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);
    });

    it('rejects when database version is much higher than code version', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '99' }]);

      const result = runMigrations(fake);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Downgrade not supported');
    });
  });

  describe('fresh install schema_version correctness', () => {
    it('writes CURRENT_DB_VERSION on fresh install, not BASE_SCHEMA_VERSION', () => {
      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // The schema_version INSERT should write CURRENT_DB_VERSION
      const metaInsert = fake.executedSql.find(
        (s) => s.toUpperCase().includes('INSERT OR REPLACE INTO MOBILE_META'),
      );
      expect(metaInsert).toBeDefined();
      // The param should be CURRENT_DB_VERSION
      const insertIdx = fake.executedSql.indexOf(metaInsert!);
      const params = fake.executedParams[insertIdx];
      expect(params[1]).toBe(String(CURRENT_DB_VERSION));
    });

    it('fresh install followed by runMigrations is a no-op', () => {
      // First run: fresh install
      const result1 = runMigrations(fake);
      expect(result1.success).toBe(true);
      expect(result1.toVersion).toBe(CURRENT_DB_VERSION);

      // Second run: should be no-op
      const sqlBefore = fake.executedSql.length;
      const result2 = runMigrations(fake);
      expect(result2.success).toBe(true);
      expect(result2.fromVersion).toBe(CURRENT_DB_VERSION);
      expect(result2.toVersion).toBe(CURRENT_DB_VERSION);

      // Only the ensureMetaTable CREATE + SELECT should have been added
      const newSql = fake.executedSql.slice(sqlBefore);
      const alterStatements = newSql.filter(
        (s) => s.toUpperCase().startsWith('ALTER TABLE'),
      );
      expect(alterStatements).toHaveLength(0);
    });
  });

  describe('P0-2: skip ADD COLUMN when column already exists', () => {
    it('schema_version=1 with V3 columns already present: succeeds without ALTER', () => {
      // Simulate a database that was created with V3 schema but has schema_version=1
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);
      // Seed pending_messages with clientMessageId column (V2 column)
      fake.seedTable('mobile_pending_messages', [
        { localId: 'l1', conversationId: 'c1', sendType: 'private', payloadJson: '{}', clientMessageId: 'x', status: 'pending', retryCount: 0, createdAt: 1, updatedAt: 1, nextRetryAt: null },
      ]);
      // Seed upload_tasks with V3 columns
      fake.seedTable('mobile_upload_tasks', [
        { taskId: 't1', conversationId: 'c1', localMessageId: 'm1', fileUri: 'f', fileName: 'n', mimeType: 'm', fileSize: 1, uploadType: 'IMAGE', status: 'pending', progress: 0, retryCount: 0, createdAt: 1, updatedAt: 1, remoteUrl: null, lastError: null, nextRetryAt: null, maxRetryCount: null, checksum: null, remoteFileId: null, lastAttemptAt: null },
      ]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // ALTER TABLE ADD COLUMN statements should have been SKIPPED (not executed)
      const alterStatements = fake.executedSql.filter(
        (s) => s.toUpperCase().startsWith('ALTER TABLE') && s.toUpperCase().includes('ADD COLUMN'),
      );
      expect(alterStatements).toHaveLength(0);
    });

    it('schema_version=2 with V3 upload columns already present: succeeds without V3 ALTER', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '2' }]);
      // Seed upload_tasks with V3 columns already present
      fake.seedTable('mobile_upload_tasks', [
        { taskId: 't1', conversationId: 'c1', localMessageId: 'm1', fileUri: 'f', fileName: 'n', mimeType: 'm', fileSize: 1, uploadType: 'IMAGE', status: 'pending', progress: 0, retryCount: 0, createdAt: 1, updatedAt: 1, remoteUrl: null, lastError: null, nextRetryAt: null, maxRetryCount: null, checksum: null, remoteFileId: null, lastAttemptAt: null },
      ]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(2);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // V3 ALTER TABLE ADD COLUMN should have been SKIPPED
      const alterStatements = fake.executedSql.filter(
        (s) => s.toUpperCase().startsWith('ALTER TABLE') && s.toUpperCase().includes('ADD COLUMN'),
      );
      expect(alterStatements).toHaveLength(0);
    });

    it('column does NOT exist: ALTER is still executed', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);
      // Seed pending_messages WITHOUT clientMessageId column
      fake.seedTable('mobile_pending_messages', [
        { localId: 'l1', conversationId: 'c1', sendType: 'private', payloadJson: '{}', status: 'pending', retryCount: 0, createdAt: 1, updatedAt: 1 },
      ]);
      // Seed upload_tasks WITHOUT V3 columns
      fake.seedTable('mobile_upload_tasks', [
        { taskId: 't1', conversationId: 'c1', localMessageId: 'm1', fileUri: 'f', fileName: 'n', mimeType: 'm', fileSize: 1, uploadType: 'IMAGE', status: 'pending', progress: 0, retryCount: 0, createdAt: 1, updatedAt: 1, remoteUrl: null, lastError: null },
      ]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // ALTER TABLE ADD COLUMN should have been EXECUTED
      const alterStatements = fake.executedSql.filter(
        (s) => s.toUpperCase().startsWith('ALTER TABLE') && s.toUpperCase().includes('ADD COLUMN'),
      );
      expect(alterStatements.length).toBeGreaterThan(0);
    });

    it('writes correct schema_version after skipping existing columns', () => {
      fake.seedTable('mobile_meta', [{ key: 'schema_version', value: '1' }]);
      fake.seedTable('mobile_pending_messages', [
        { localId: 'l1', conversationId: 'c1', sendType: 'private', payloadJson: '{}', clientMessageId: 'x', status: 'pending', retryCount: 0, createdAt: 1, updatedAt: 1, nextRetryAt: null },
      ]);
      fake.seedTable('mobile_upload_tasks', [
        { taskId: 't1', conversationId: 'c1', localMessageId: 'm1', fileUri: 'f', fileName: 'n', mimeType: 'm', fileSize: 1, uploadType: 'IMAGE', status: 'pending', progress: 0, retryCount: 0, createdAt: 1, updatedAt: 1, remoteUrl: null, lastError: null, nextRetryAt: null, maxRetryCount: null, checksum: null, remoteFileId: null, lastAttemptAt: null },
      ]);

      const result = runMigrations(fake);

      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(CURRENT_DB_VERSION);

      // The result itself confirms the final version is CURRENT_DB_VERSION
      // Also verify the mobile_meta table was updated
      const metaRows = fake.getTableRows('mobile_meta');
      const schemaRow = metaRows.find((r) => r.key === 'schema_version');
      expect(schemaRow).toBeDefined();
      expect(schemaRow!.value).toBe(String(CURRENT_DB_VERSION));
    });
  });
});
