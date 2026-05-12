// Trace ID utility extracted from apps/web/src/utils/httpClient.ts

/**
 * 生成追踪ID
 */
export function createTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
