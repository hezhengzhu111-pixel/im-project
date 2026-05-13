import { redactSensitiveValue } from '@/utils/logger';

export interface DebugErrorRecord {
  message: string;
  createdAt: number;
  url?: string;
  status?: number;
}

let lastApiError: DebugErrorRecord | null = null;
let lastWsError: DebugErrorRecord | null = null;

const sanitizeUrl = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }
  return redactSensitiveValue(url.split('?')[0] || '');
};

const sanitizeMessage = (message: string): string =>
  redactSensitiveValue(message).replace(
    /\b(access[_-]?token|refresh[_-]?token|token|cookie|password|api[_-]?key|authorization|secret)\b/gi,
    '[REDACTED]',
  );

export const debugTelemetry = {
  recordApiError(input: { message: string; status?: number; url?: string }): void {
    lastApiError = {
      message: sanitizeMessage(input.message),
      status: input.status,
      url: sanitizeUrl(input.url),
      createdAt: Date.now(),
    };
  },

  getLastApiError(): DebugErrorRecord | null {
    return lastApiError ? { ...lastApiError } : null;
  },

  clearLastApiError(): void {
    lastApiError = null;
  },

  recordWsError(input: { message: string; status?: number; url?: string }): void {
    lastWsError = {
      message: sanitizeMessage(input.message),
      status: input.status,
      url: sanitizeUrl(input.url),
      createdAt: Date.now(),
    };
  },

  getLastWsError(): DebugErrorRecord | null {
    return lastWsError ? { ...lastWsError } : null;
  },

  clearLastWsError(): void {
    lastWsError = null;
  },

  clear(): void {
    lastApiError = null;
    lastWsError = null;
  },
};
