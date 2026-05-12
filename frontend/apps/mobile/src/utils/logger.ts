import type { LocalLogEntry } from '@/types/models';

const SENSITIVE_KEY_PARTS = ['token', 'cookie', 'password', 'apikey', 'api_key', 'authorization', 'secret'];
const entries: LocalLogEntry[] = [];

const shouldRedactKey = (key: string) => {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part.replace(/[-_]/g, '')));
};

const redactText = (text: string) =>
  text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /("(?:access[_-]?token|refresh[_-]?token|token|cookie|password|api[_-]?key|authorization|secret)"\s*:\s*")[^"]+(")/gi,
      '$1[REDACTED]$2',
    )
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|token|cookie|password|api[_-]?key|authorization|secret)=([^&\s]+)/gi,
      '$1=[REDACTED]',
    );

const redact = (value: unknown): string => {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return redactText(value);
  }
  try {
    return redactText(JSON.stringify(value, (key, next: unknown) => (shouldRedactKey(key) ? '[REDACTED]' : next)));
  } catch {
    return redactText(String(value));
  }
};

const push = (level: LocalLogEntry['level'], scope: string, message: string, detail?: unknown) => {
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    scope,
    message,
    detail: detail == null ? undefined : redact(detail),
    createdAt: Date.now(),
  });
  if (entries.length > 200) {
    entries.splice(200);
  }
};

export const logger = {
  info(scope: string, message: string, detail?: unknown) {
    push('info', scope, message, detail);
  },
  warn(scope: string, message: string, detail?: unknown) {
    push('warn', scope, message, detail);
  },
  error(scope: string, message: string, detail?: unknown) {
    push('error', scope, message, detail);
  },
  list(): LocalLogEntry[] {
    return entries.slice();
  },
  clear() {
    entries.length = 0;
  },
};
