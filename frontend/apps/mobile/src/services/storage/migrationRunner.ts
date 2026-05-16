import {
  BASE_SCHEMA_VERSION,
  CREATE_SCHEMA_SQL,
  CURRENT_DB_VERSION,
  getMigrationSteps,
} from './storageMigrations';
import type { DbConnection } from './messageDatabase';
import { logger } from '@/utils/logger';

export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  error?: string;
}

const TAG = 'migration-runner';

/**
 * Ensure the mobile_meta table exists (required before reading schema_version).
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to call on any database state.
 */
function ensureMetaTable(conn: DbConnection): void {
  conn.execute(
    'CREATE TABLE IF NOT EXISTS mobile_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  );
}

/**
 * Read the current schema_version from mobile_meta.
 * Returns 0 if the row doesn't exist (fresh database or pre-migration V1).
 */
function readSchemaVersion(conn: DbConnection): number {
  const result = conn.execute(
    "SELECT value FROM mobile_meta WHERE key = 'schema_version' LIMIT 1",
  );
  const rows = result.rows;
  if (!rows || rows.length === 0) {
    return 0;
  }
  const raw = rows.item(0).value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Write schema_version to mobile_meta inside the caller's transaction.
 */
function writeSchemaVersion(conn: DbConnection, version: number): void {
  conn.execute('INSERT OR REPLACE INTO mobile_meta(key, value) VALUES (?, ?)', [
    'schema_version',
    String(version),
  ]);
}

/**
 * Run a full fresh-install schema (CREATE_SCHEMA_SQL) and set schema_version.
 * Called when readSchemaVersion returns 0 and the database has no tables yet.
 */
function runFreshInstall(conn: DbConnection): void {
  conn.execute('BEGIN TRANSACTION');
  try {
    for (const sql of CREATE_SCHEMA_SQL) {
      conn.execute(sql);
    }
    writeSchemaVersion(conn, BASE_SCHEMA_VERSION);
    conn.execute('COMMIT');
  } catch (error) {
    conn.execute('ROLLBACK');
    throw error;
  }
}

/**
 * Run incremental migration steps from `fromVersion` to `toVersion`.
 * Each step runs inside its own transaction.
 */
function runIncrementalMigrations(
  conn: DbConnection,
  fromVersion: number,
  toVersion: number,
): void {
  const steps = getMigrationSteps(fromVersion, toVersion);
  for (const step of steps) {
    conn.execute('BEGIN TRANSACTION');
    try {
      for (const sql of step.statements) {
        conn.execute(sql);
      }
      writeSchemaVersion(conn, step.version);
      conn.execute('COMMIT');
      logger.info(TAG, `migrated to version ${step.version}`);
    } catch (error) {
      conn.execute('ROLLBACK');
      throw new Error(
        `Migration to version ${step.version} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Run database migrations on the given connection.
 *
 * Flow:
 * 1. Ensure mobile_meta table exists.
 * 2. Read schema_version (0 if missing).
 * 3. If version is 0 and database has no other tables → fresh install with CREATE_SCHEMA_SQL.
 * 4. If version is 0 but tables exist → treat as V1 (legacy database without version tracking).
 * 5. If version < CURRENT_DB_VERSION → run incremental migrations.
 * 6. If version > CURRENT_DB_VERSION → error (downgrade not supported).
 * 7. If version === CURRENT_DB_VERSION → no-op.
 *
 * Returns MigrationResult with success status and version range.
 */
export function runMigrations(conn: DbConnection): MigrationResult {
  ensureMetaTable(conn);
  const currentVersion = readSchemaVersion(conn);

  // Already at target version
  if (currentVersion === CURRENT_DB_VERSION) {
    return { success: true, fromVersion: currentVersion, toVersion: CURRENT_DB_VERSION };
  }

  // Downgrade: code is older than database
  if (currentVersion > CURRENT_DB_VERSION) {
    const error = `Database version (${currentVersion}) is newer than code version (${CURRENT_DB_VERSION}). Downgrade not supported.`;
    logger.error(TAG, error);
    return { success: false, fromVersion: currentVersion, toVersion: CURRENT_DB_VERSION, error };
  }

  // Fresh database (no schema_version row, no tables)
  if (currentVersion === 0) {
    const hasExistingTables = checkHasExistingTables(conn);
    if (!hasExistingTables) {
      try {
        runFreshInstall(conn);
        logger.info(TAG, `fresh install completed at version ${BASE_SCHEMA_VERSION}`);
        return { success: true, fromVersion: 0, toVersion: BASE_SCHEMA_VERSION };
      } catch (error) {
        const msg = `Fresh install failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(TAG, msg);
        return { success: false, fromVersion: 0, toVersion: CURRENT_DB_VERSION, error: msg };
      }
    }
    // Legacy database without version tracking: treat as V1
    logger.info(TAG, 'legacy database detected (no schema_version), treating as version 1');
    writeSchemaVersion(conn, BASE_SCHEMA_VERSION);
    // Fall through to check if incremental migrations are needed from V1
  }

  const effectiveVersion = currentVersion === 0 ? BASE_SCHEMA_VERSION : currentVersion;

  // Incremental migration
  if (effectiveVersion < CURRENT_DB_VERSION) {
    try {
      runIncrementalMigrations(conn, effectiveVersion, CURRENT_DB_VERSION);
      logger.info(TAG, `migration complete: ${effectiveVersion} -> ${CURRENT_DB_VERSION}`);
      return { success: true, fromVersion: effectiveVersion, toVersion: CURRENT_DB_VERSION };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(TAG, `migration failed: ${msg}`);
      return { success: false, fromVersion: effectiveVersion, toVersion: CURRENT_DB_VERSION, error: msg };
    }
  }

  return { success: true, fromVersion: effectiveVersion, toVersion: CURRENT_DB_VERSION };
}

/**
 * Check if the database has any tables besides mobile_meta.
 * Used to distinguish a truly fresh database from a legacy one.
 */
function checkHasExistingTables(conn: DbConnection): boolean {
  try {
    const result = conn.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'mobile_meta' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    );
    return (result.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
