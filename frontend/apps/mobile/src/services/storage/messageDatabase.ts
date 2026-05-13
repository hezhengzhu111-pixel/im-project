import { DB_VERSION, CREATE_SCHEMA_SQL } from './storageMigrations';
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
    return db;
  } catch (error) {
    sqliteUnavailable = true;
    logger.warn('message-db', 'quick-sqlite unavailable; memory fallback active', error);
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
  } catch (error) {
    sqliteUnavailable = true;
    logger.error('message-db', 'schema migration failed; memory fallback active', error);
  }
}
