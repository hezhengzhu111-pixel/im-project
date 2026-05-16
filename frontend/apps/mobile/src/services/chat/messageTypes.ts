/**
 * Typed query parameters for message history pagination.
 * Mobile统一字段名，不假设后端一定支持所有字段。
 */
export interface HistoryQueryParams {
  /** Page size — number of messages to return. */
  size?: number;
  /** Return messages with id less than this value (cursor-based older). */
  beforeId?: string;
  /** Return messages created before this ISO timestamp (cursor-based older). */
  beforeTime?: string;
  /** Return messages with id greater than this value (cursor-based newer). */
  afterId?: string;
  /** Return messages created after this ISO timestamp (cursor-based newer). */
  afterTime?: string;
  /** Pagination direction hint. */
  direction?: 'older' | 'newer';
}

/**
 * Build a clean query-parameter object from HistoryQueryParams.
 * Strips undefined/null values so axios does not send dirty query strings.
 * Does NOT inject a default `size` — the caller must opt in.
 */
export function buildHistoryParams(options: HistoryQueryParams): Record<string, string> {
  const result: Record<string, string> = {};

  if (options.size != null) {
    result.size = String(options.size);
  }
  if (options.beforeId != null) {
    result.beforeId = options.beforeId;
  }
  if (options.beforeTime != null) {
    result.beforeTime = options.beforeTime;
  }
  if (options.afterId != null) {
    result.afterId = options.afterId;
  }
  if (options.afterTime != null) {
    result.afterTime = options.afterTime;
  }
  if (options.direction != null) {
    result.direction = options.direction;
  }

  return result;
}
