import type { DbConnection, DbResult } from '../messageDatabase';

/**
 * Compare two values that may be numbers or date strings.
 * ISO 8601 date strings are lexicographically sortable, so string
 * comparison works correctly for them. Numbers are compared numerically.
 * Mixed types fall back to string comparison.
 */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    return numA - numB;
  }
  return String(a).localeCompare(String(b));
}

/**
 * Count how many ? appear before the first ? in the string.
 * Used to compute the correct param index within a condition fragment.
 */
function countQuestionMarksBefore(s: string): number {
  const idx = s.indexOf('?');
  if (idx < 0) return 0;
  return (s.substring(0, idx).match(/\?/g) || []).length;
}

/**
 * Test-only fake DbConnection.
 * Records executed SQL in order and supports in-memory table operations with
 * WHERE filtering, ORDER BY, LIMIT, COUNT(*), IN(...) and PRAGMA table_info.
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

  /** Column definitions for PRAGMA table_info support, keyed by table name */
  private tableColumns: Map<string, Array<{ name: string; type: string }>> = new Map();

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

    // Handle PRAGMA table_info
    if (normalized.startsWith('PRAGMA')) {
      return this.handlePragma(sql);
    }

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
      return this.handleSelect(sql, params);
    }

    // Handle DELETE
    if (normalized.startsWith('DELETE')) {
      return this.handleDelete(sql, params);
    }

    return { rows: { length: 0, item: () => ({}), raw: () => [] } };
  }

  private handlePragma(sql: string): DbResult {
    const match = sql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
    if (!match) {
      return buildDbResult([]);
    }
    const tableName = match[1];
    const columns = this.tableColumns.get(tableName) || [];
    return buildDbResult(
      columns.map((col, i) => ({
        cid: i,
        name: col.name,
        type: col.type,
        notnull: 0,
        dflt_value: null,
        pk: i === 0 ? 1 : 0,
      })),
    );
  }

  private handleInsert(sql: string, params: unknown[]): DbResult {
    const match = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    if (!match) {
      return { rows: { length: 0, item: () => ({}), raw: () => [] } };
    }
    const tableName = match[1];
    const rows = this.tables.get(tableName) || [];

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

  private handleSelect(sql: string, params: unknown[] = []): DbResult {
    // Check query overrides first
    for (const override of this.queryOverrides) {
      if (override.pattern.test(sql)) {
        return buildDbResult(override.rows);
      }
    }

    // Handle sqlite_master queries
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

    // Handle COUNT(*)
    const countMatch = sql.match(/SELECT\s+COUNT\s*\(\s*\*\s*\)\s*(?:AS\s+(\w+)\s+)?FROM\s+(\w+)/i);
    if (countMatch) {
      const alias = countMatch[1] || 'cnt';
      const tableName = countMatch[2];
      let rows = this.tables.get(tableName) || [];
      rows = this.applyWhere(rows, sql, params);
      return buildDbResult([{ [alias]: rows.length }]);
    }

    // Extract table name
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) {
      return buildDbResult([]);
    }
    const tableName = fromMatch[1];
    let rows = [...(this.tables.get(tableName) || [])];

    // Apply WHERE
    rows = this.applyWhere(rows, sql, params);

    // Apply ORDER BY
    rows = this.applyOrderBy(rows, sql);

    // Apply LIMIT
    rows = this.applyLimit(rows, sql, params);

    return buildDbResult(rows);
  }

  private applyWhere(
    rows: Record<string, unknown>[],
    sql: string,
    params: unknown[],
  ): Record<string, unknown>[] {
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
    if (!whereMatch) {
      return rows;
    }
    const whereClause = whereMatch[1];
    return this.evaluateWhere(rows, whereClause, params);
  }

  private evaluateWhere(
    rows: Record<string, unknown>[],
    clause: string,
    params: unknown[],
  ): Record<string, unknown>[] {
    // Split by AND (respecting parenthesized groups)
    const conditions = this.splitAndConditions(clause);

    let result = rows;
    let paramPos = 0;
    for (const cond of conditions) {
      const { result: next, paramsUsed } = this.applyCondition(result, cond.trim(), params, paramPos);
      result = next;
      paramPos += paramsUsed;
    }
    return result;
  }

  private splitAndConditions(clause: string): string[] {
    // Split on AND that is not inside parentheses
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    const upper = clause.toUpperCase();
    let i = 0;
    while (i < clause.length) {
      if (clause[i] === '(') {
        depth++;
        current += clause[i];
        i++;
      } else if (clause[i] === ')') {
        depth--;
        current += clause[i];
        i++;
      } else if (depth === 0 && upper.substring(i).startsWith(' AND ')) {
        parts.push(current);
        current = '';
        i += 5; // skip ' AND '
      } else {
        current += clause[i];
        i++;
      }
    }
    if (current.trim()) {
      parts.push(current);
    }
    return parts;
  }

  private applyCondition(
    rows: Record<string, unknown>[],
    cond: string,
    params: unknown[],
    paramPos: number,
  ): { result: Record<string, unknown>[]; paramsUsed: number } {
    const trimmed = cond.trim();

    // Handle parenthesized group: (cond1 OR cond2)
    const parenMatch = trimmed.match(/^\((.+)\)$/);
    if (parenMatch) {
      return this.evaluateOrGroup(rows, parenMatch[1], params, paramPos);
    }

    // column IS NULL
    const isNullMatch = trimmed.match(/^(\w+)\s+IS\s+NULL$/i);
    if (isNullMatch) {
      const col = isNullMatch[1];
      return { result: rows.filter((r) => r[col] == null), paramsUsed: 0 };
    }

    // column IS NOT NULL
    const isNotNullMatch = trimmed.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const col = isNotNullMatch[1];
      return { result: rows.filter((r) => r[col] != null), paramsUsed: 0 };
    }

    // column IN ('a', 'b', ...)
    const inMatch = trimmed.match(/^(\w+)\s+IN\s*\((.+)\)$/i);
    if (inMatch) {
      const col = inMatch[1];
      const values = this.parseInValues(inMatch[2]);
      return { result: rows.filter((r) => values.includes(String(r[col]))), paramsUsed: 0 };
    }

    // column != ? or column <= ? or column >= ? or column = ? or column < ? or column > ?
    const opMatch = trimmed.match(/^(\w+)\s*(!=|<=|>=|=|<|>)\s*\?$/);
    if (opMatch) {
      const col = opMatch[1];
      const op = opMatch[2];
      const paramIdx = paramPos + countQuestionMarksBefore(trimmed);
      if (paramIdx >= params.length) {
        return { result: rows, paramsUsed: 1 };
      }
      const val = params[paramIdx];
      return {
        result: rows.filter((r) => {
          const rv = r[col];
          if (op === '!=') return !(rv == val); // eslint-disable-line eqeqeq
          if (op === '=') return rv == val; // eslint-disable-line eqeqeq
          if (op === '<=') return rv == null || compareValues(rv, val) <= 0;
          if (op === '>=') return compareValues(rv, val) >= 0;
          if (op === '<') return compareValues(rv, val) < 0;
          if (op === '>') return compareValues(rv, val) > 0;
          return true;
        }),
        paramsUsed: 1,
      };
    }

    // column = 'literal'
    const literalMatch = trimmed.match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (literalMatch) {
      const col = literalMatch[1];
      const val = literalMatch[2];
      return { result: rows.filter((r) => String(r[col]) === val), paramsUsed: 0 };
    }

    return { result: rows, paramsUsed: 0 };
  }

  private evaluateOrGroup(
    rows: Record<string, unknown>[],
    clause: string,
    params: unknown[],
    paramPos: number,
  ): { result: Record<string, unknown>[]; paramsUsed: number } {
    // Split by OR
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    const upper = clause.toUpperCase();
    let i = 0;
    while (i < clause.length) {
      if (clause[i] === '(') { depth++; current += clause[i]; i++; }
      else if (clause[i] === ')') { depth--; current += clause[i]; i++; }
      else if (depth === 0 && upper.substring(i).startsWith(' OR ')) {
        parts.push(current);
        current = '';
        i += 4;
      } else {
        current += clause[i];
        i++;
      }
    }
    if (current.trim()) parts.push(current);

    const matchedIndices = new Set<number>();
    let branchPos = paramPos;
    let totalUsed = 0;
    for (const part of parts) {
      const { result: filtered, paramsUsed } = this.applyCondition(rows, part.trim(), params, branchPos);
      if (totalUsed === 0) totalUsed = paramsUsed;
      branchPos += paramsUsed;
      for (const row of filtered) {
        const idx = rows.indexOf(row);
        if (idx >= 0) matchedIndices.add(idx);
      }
    }
    return { result: rows.filter((_, idx) => matchedIndices.has(idx)), paramsUsed: totalUsed };
  }

  private parseInValues(valueStr: string): string[] {
    // Parse 'a', 'b', 'c' from IN clause
    const values: string[] = [];
    const regex = /'([^']*)'/g;
    let m;
    while ((m = regex.exec(valueStr)) !== null) {
      values.push(m[1]);
    }
    return values;
  }

  private applyOrderBy(rows: Record<string, unknown>[], sql: string): Record<string, unknown>[] {
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (!orderMatch) {
      return rows;
    }
    const col = orderMatch[1];
    const dir = (orderMatch[2] || 'ASC').toUpperCase();

    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[col], b[col]);
      return dir === 'DESC' ? -cmp : cmp;
    });
  }

  private applyLimit(rows: Record<string, unknown>[], sql: string, params: unknown[] = []): Record<string, unknown>[] {
    const limitMatch = sql.match(/LIMIT\s+(\?|\d+)/i);
    if (!limitMatch) {
      return rows;
    }
    const raw = limitMatch[1];
    const limit = raw === '?'
      ? Number(params[params.length - 1] ?? rows.length)
      : parseInt(raw, 10);
    return rows.slice(0, limit);
  }

  private handleDelete(sql: string, params: unknown[] = []): DbResult {
    const match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      const tableName = match[1];
      const rows = this.tables.get(tableName) || [];
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (whereMatch && params.length > 0) {
        const pkColumn = whereMatch[1];
        const pkValue = params[0];
        const filteredRows = rows.filter((r) => r[pkColumn] !== pkValue);
        this.tables.set(tableName, filteredRows);
      } else {
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
    // Auto-detect columns from seeded data
    if (rows.length > 0 && !this.tableColumns.has(tableName)) {
      const cols = Object.keys(rows[0]).map((name) => ({ name, type: 'TEXT' }));
      this.tableColumns.set(tableName, cols);
    }
  }

  /** Register column definitions for PRAGMA table_info support */
  setTableColumns(tableName: string, columns: Array<{ name: string; type: string }>): void {
    this.tableColumns.set(tableName, columns);
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
    this.tableColumns.clear();
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
