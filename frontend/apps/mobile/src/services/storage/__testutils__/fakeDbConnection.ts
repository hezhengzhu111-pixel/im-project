import type { DbConnection, DbResult } from '../messageDatabase';

/**
 * Test-only fake DbConnection.
 * Records executed SQL in order and supports basic in-memory table operations.
 * NOT for production use.
 */
export class FakeDbConnection implements DbConnection {
  /** All SQL statements in execution order */
  executedSql: string[] = [];

  /** All params arrays in execution order (parallel to executedSql) */
  executedParams: Array<unknown[]> = [];

  /** SQL patterns that should throw on next match */
  private errorTriggers: Array<{ pattern: RegExp; error: Error }> = [];

  /** In-memory row storage keyed by table name */
  private tables: Map<string, Record<string, unknown>[]> = new Map();

  /** Custom row results to return for specific SQL patterns */
  private queryOverrides: Array<{
    pattern: RegExp;
    rows: Record<string, unknown>[];
  }> = [];

  execute(sql: string, params: unknown[] = []): DbResult {
    this.executedSql.push(sql);
    this.executedParams.push(params);

    // Check error triggers
    for (const trigger of this.errorTriggers) {
      if (trigger.pattern.test(sql)) {
        throw trigger.error;
      }
    }

    const normalized = sql.trim().toUpperCase();

    // Handle CREATE TABLE
    if (normalized.startsWith('CREATE TABLE') || normalized.startsWith('CREATE INDEX')) {
      return { rows: { length: 0, item: () => ({}), raw: () => [] } };
    }

    // Handle INSERT OR REPLACE
    if (normalized.startsWith('INSERT OR REPLACE') || normalized.startsWith('INSERT')) {
      return this.handleInsert(sql, params);
    }

    // Handle SELECT
    if (normalized.startsWith('SELECT')) {
      return this.handleSelect(sql);
    }

    // Handle DELETE
    if (normalized.startsWith('DELETE')) {
      return this.handleDelete(sql, params);
    }

    return { rows: { length: 0, item: () => ({}), raw: () => [] } };
  }

  private handleInsert(sql: string, params: unknown[]): DbResult {
    // Extract table name from INSERT OR REPLACE INTO tableName or INSERT INTO tableName
    const match = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    if (!match) {
      return { rows: { length: 0, item: () => ({}), raw: () => [] } };
    }
    const tableName = match[1];
    const rows = this.tables.get(tableName) || [];

    // Extract column names
    const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (colMatch) {
      const columns = colMatch[1].split(',').map((c) => c.trim());
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = params[i] ?? null;
      });

      // Upsert by first column (primary key)
      const pk = columns[0];
      const existingIndex = rows.findIndex((r) => r[pk] === row[pk]);
      if (existingIndex >= 0) {
        rows[existingIndex] = row;
      } else {
        rows.push(row);
      }
      this.tables.set(tableName, rows);
    }

    return { rows: { length: 0, item: () => ({}), raw: () => [] } };
  }

  private handleSelect(sql: string): DbResult {
    // Check query overrides first
    for (const override of this.queryOverrides) {
      if (override.pattern.test(sql)) {
        return buildDbResult(override.rows);
      }
    }

    // Handle sqlite_master queries (used by migration runner to detect existing tables)
    if (/sqlite_master/i.test(sql)) {
      const excludePattern = /AND\s+name\s*!=\s*'mobile_meta'/i;
      const hasExclude = excludePattern.test(sql);
      const tableNames = Array.from(this.tables.keys()).filter((name) => {
        if (hasExclude && name === 'mobile_meta') {
          return false;
        }
        return !name.startsWith('sqlite_');
      });
      return buildDbResult(tableNames.map((name) => ({ name })));
    }

    // Simple table scan: SELECT ... FROM tableName
    const match = sql.match(/FROM\s+(\w+)/i);
    if (!match) {
      return buildDbResult([]);
    }
    const tableName = match[1];
    const rows = this.tables.get(tableName) || [];
    return buildDbResult(rows);
  }

  private handleDelete(sql: string, params: unknown[] = []): DbResult {
    // Extract table name from DELETE FROM tableName
    const match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      const tableName = match[1];
      const rows = this.tables.get(tableName) || [];
      // Check if there's a WHERE clause with primary key
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (whereMatch && params.length > 0) {
        const pkColumn = whereMatch[1];
        const pkValue = params[0];
        const filteredRows = rows.filter((r) => r[pkColumn] !== pkValue);
        this.tables.set(tableName, filteredRows);
      } else {
        // DELETE without WHERE - clear all rows
        this.tables.set(tableName, []);
      }
    }
    return { rows: { length: 0, item: () => ({}), raw: () => [] } };
  }

  /** Schedule an error to throw when SQL matches the pattern */
  throwOnSql(pattern: RegExp, error: Error): void {
    this.errorTriggers.push({ pattern, error });
  }

  /** Override SELECT results for a specific SQL pattern */
  overrideQuery(pattern: RegExp, rows: Record<string, unknown>[]): void {
    this.queryOverrides.push({ pattern, rows });
  }

  /** Seed a table with rows (for setting up test data) */
  seedTable(tableName: string, rows: Record<string, unknown>[]): void {
    this.tables.set(tableName, [...rows]);
  }

  /** Get all rows currently stored in a table */
  getTableRows(tableName: string): Record<string, unknown>[] {
    return this.tables.get(tableName) || [];
  }

  /** Reset all recorded state (SQL log, errors, overrides, table data) */
  reset(): void {
    this.executedSql = [];
    this.executedParams = [];
    this.errorTriggers = [];
    this.queryOverrides = [];
    this.tables.clear();
  }
}

function buildDbResult(rows: Record<string, unknown>[]): DbResult {
  return {
    rows: {
      length: rows.length,
      item: (index: number) => rows[index] ?? {},
      raw: () => rows,
    },
  };
}

/**
 * Create a fresh FakeDbConnection with standard error triggers for common test scenarios.
 */
export function createFakeDb(): FakeDbConnection {
  return new FakeDbConnection();
}
