import { getMigrationSteps, CURRENT_DB_VERSION, BASE_SCHEMA_VERSION, MIGRATIONS } from '../storageMigrations';
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
    // V1→V2 now has migration steps, so test a range with no steps (e.g., 2→3 when 3 doesn't exist)
    expect(getMigrationSteps(2, 3)).toEqual([]);
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
    expect(result.toVersion).toBe(BASE_SCHEMA_VERSION);

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
});
