import { DB_VERSION, CREATE_SCHEMA_SQL } from './storageMigrations';
import { IS_RELEASE_RUNTIME, MOBILE_APP_ENV } from '@/constants/config';
import { logger } from '@/utils/logger';

type SqlValue = string | number | null | undefined;

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
const memoryTables = new Map<string, Map<string, Record<string, unknown>>>();
let storageHealth = {
  mode: 'unknown' as 'unknown' | 'sqlite' | 'memory',
  persistenceAvailable: false,
  lastError: '',
  releaseVisibilityRequired: false,
  appEnv: MOBILE_APP_ENV,
};

const setStorageHealth = (next: Partial<typeof storageHealth>) => {
  storageHealth = { ...storageHealth, ...next, appEnv: MOBILE_APP_ENV };
};

const reportFallback = (message: string, error: unknown) => {
  setStorageHealth({
    mode: 'memory',
    persistenceAvailable: false,
    lastError: error instanceof Error ? error.message : String(error || message),
    releaseVisibilityRequired: IS_RELEASE_RUNTIME,
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

  getStorageHealth() {
    const mode = openSqlite() ? 'sqlite' : 'memory';
    return {
      ...storageHealth,
      mode,
      persistenceAvailable: mode === 'sqlite',
      releaseVisibilityRequired: mode === 'memory' && IS_RELEASE_RUNTIME,
    };
  },
};

export async function initializeStorage(): Promise<void> {
  const conn = openSqlite();
  if (!conn) {
    return;
  }
  try {
    CREATE_SCHEMA_SQL.forEach((sql) => conn.execute(sql));
    conn.execute('INSERT OR REPLACE INTO mobile_meta(key, value) VALUES (?, ?)', [
      'schema_version',
      String(DB_VERSION),
    ]);
    setStorageHealth({
      mode: 'sqlite',
      persistenceAvailable: true,
      lastError: '',
      releaseVisibilityRequired: false,
    });
  } catch (error) {
    sqliteUnavailable = true;
    reportFallback('schema migration failed', error);
  }
}
