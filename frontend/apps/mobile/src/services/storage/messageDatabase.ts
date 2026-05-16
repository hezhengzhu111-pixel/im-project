import { CURRENT_DB_VERSION } from './storageMigrations';
import { runMigrations } from './migrationRunner';
import { IS_RELEASE_RUNTIME, MOBILE_APP_ENV } from '@/constants/config';
import { logger } from '@/utils/logger';

type SqlValue = string | number | null | undefined;

export type MigrationStatus = 'unknown' | 'not_started' | 'running' | 'success' | 'failed';

export interface StorageHealthState {
  mode: 'unknown' | 'sqlite' | 'memory';
  persistenceAvailable: boolean;
  lastError: string;
  releaseVisibilityRequired: boolean;
  appEnv: string;
  schemaVersion: number | null;
  targetSchemaVersion: number;
  migrationStatus: MigrationStatus;
  lastMigrationError: string;
}

export interface DbResult {
  rows?: {
    length: number;
    item: (index: number) => Record<string, unknown>;
    raw?: () => Record<string, unknown>[];
  };
}

export interface DbConnection {
  execute: (sql: string, params?: SqlValue[]) => DbResult;
  close?: () => void;
}

type QuickSqliteModule = {
  open?: (options: { name: string; location?: string }) => DbConnection;
};

let db: DbConnection | null = null;
let sqliteUnavailable = false;
/**
 * Memory fallback storage.
 *
 * 边界说明：
 * - 仅用于开发/测试环境，或 quick-sqlite 不可用时的异常降级。
 * - 数据仅存在于进程内存，进程退出后数据丢失，不保证持久化。
 * - release 构建应确保 quick-sqlite 可用；memory 模式下 getStorageHealth()
 *   会标记 releaseVisibilityRequired = true 以便上层感知。
 */
const memoryTables = new Map<string, Map<string, Record<string, unknown>>>();
let storageHealth: StorageHealthState = {
  mode: 'unknown',
  persistenceAvailable: false,
  lastError: '',
  releaseVisibilityRequired: false,
  appEnv: MOBILE_APP_ENV,
  schemaVersion: null,
  targetSchemaVersion: CURRENT_DB_VERSION,
  migrationStatus: 'unknown',
  lastMigrationError: '',
};

const setStorageHealth = (next: Partial<StorageHealthState>) => {
  storageHealth = { ...storageHealth, ...next, appEnv: MOBILE_APP_ENV };
};

const reportFallback = (message: string, error: unknown) => {
  const errorMsg = error instanceof Error ? error.message : String(error || message);
  setStorageHealth({
    mode: 'memory',
    persistenceAvailable: false,
    lastError: errorMsg,
    releaseVisibilityRequired: IS_RELEASE_RUNTIME,
    migrationStatus: 'failed',
    lastMigrationError: errorMsg,
  });
  if (IS_RELEASE_RUNTIME) {
    logger.error('message-db', `${message}; release build cannot assume offline persistence is available`, error);
    return;
  }
  logger.warn('message-db', `${message}; memory fallback active`, error);
};

const table = (name: string) => {
  const existing = memoryTables.get(name);
  if (existing) {
    return existing;
  }
  const next = new Map<string, Record<string, unknown>>();
  memoryTables.set(name, next);
  return next;
};

const openSqlite = (): DbConnection | null => {
  if (sqliteUnavailable) {
    return null;
  }
  if (db) {
    return db;
  }
  try {
    const sqlite = require('react-native-quick-sqlite') as QuickSqliteModule;
    db = sqlite.open?.({ name: 'im_mobile.db', location: 'default' }) || null;
    if (db) {
      setStorageHealth({
        mode: 'sqlite',
        persistenceAvailable: true,
        lastError: '',
        releaseVisibilityRequired: false,
        migrationStatus: 'not_started',
      });
    }
    return db;
  } catch (error) {
    sqliteUnavailable = true;
    reportFallback('quick-sqlite unavailable', error);
    return null;
  }
};

const rowsFromResult = (result: DbResult): Record<string, unknown>[] => {
  const rows = result.rows;
  if (!rows) {
    return [];
  }
  if (typeof rows.raw === 'function') {
    return rows.raw();
  }
  return Array.from({ length: rows.length }, (_, index) => rows.item(index));
};

export const messageDatabase = {
  execute(sql: string, params: SqlValue[] = []): DbResult {
    const conn = openSqlite();
    if (!conn) {
      return {};
    }
    return conn.execute(sql, params);
  },

  query(sql: string, params: SqlValue[] = []): Record<string, unknown>[] {
    return rowsFromResult(this.execute(sql, params));
  },

  memoryUpsert(tableName: string, key: string, value: Record<string, unknown>): void {
    table(tableName).set(key, value);
  },

  memoryDelete(tableName: string, key: string): void {
    table(tableName).delete(key);
  },

  memoryList(tableName: string): Record<string, unknown>[] {
    return Array.from(table(tableName).values());
  },

  memoryClear(tableName: string): void {
    table(tableName).clear();
  },

  isMemoryFallback(): boolean {
    return !openSqlite();
  },

  getStorageHealth(): StorageHealthState {
    return { ...storageHealth };
  },
};

// --- Test seam (test environment only) ---

/**
 * Reset all internal module state. Test-only.
 * Restores the module to its initial pre-open state so tests run in isolation.
 */
export function __resetForTests(): void {
  db = null;
  sqliteUnavailable = false;
  memoryTables.clear();
  storageHealth = {
    mode: 'unknown',
    persistenceAvailable: false,
    lastError: '',
    releaseVisibilityRequired: false,
    appEnv: MOBILE_APP_ENV,
    schemaVersion: null,
    targetSchemaVersion: CURRENT_DB_VERSION,
    migrationStatus: 'unknown',
    lastMigrationError: '',
  };
}

/**
 * Inject a fake DbConnection for testing. Test-only.
 * Bypasses the real `react-native-quick-sqlite` require path.
 * Pass `null` to revert to the normal openSqlite() behavior.
 */
export function __setDbForTests(fakeDb: DbConnection | null): void {
  db = fakeDb;
  sqliteUnavailable = false;
}

/**
 * Read-only snapshot of internal state for assertions. Test-only.
 */
export function __getInternalStateForTests(): {
  db: DbConnection | null;
  sqliteUnavailable: boolean;
  storageHealth: StorageHealthState;
} {
  return { db, sqliteUnavailable, storageHealth: { ...storageHealth } };
}

export async function initializeStorage(): Promise<void> {
  const conn = openSqlite();
  if (!conn) {
    return;
  }
  try {
    setStorageHealth({ migrationStatus: 'running' });
    const result = runMigrations(conn);
    if (!result.success) {
      throw new Error(result.error || 'migration failed');
    }
    setStorageHealth({
      mode: 'sqlite',
      persistenceAvailable: true,
      lastError: '',
      releaseVisibilityRequired: false,
      schemaVersion: result.toVersion,
      targetSchemaVersion: CURRENT_DB_VERSION,
      migrationStatus: 'success',
      lastMigrationError: '',
    });
  } catch (error) {
    sqliteUnavailable = true;
    reportFallback('schema migration failed', error);
  }
}
