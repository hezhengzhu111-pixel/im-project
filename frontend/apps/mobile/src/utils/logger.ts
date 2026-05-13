import type { LocalLogEntry } from '@/types/models';

const SENSITIVE_KEY_PARTS = ['token', 'cookie', 'password', 'apikey', 'api_key', 'authorization', 'secret'];
const entries: LocalLogEntry[] = [];
const listeners = new Set<(logs: LocalLogEntry[]) => void>();
const MAX_RECENT_LOGS = 200;

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

const emit = () => {
  const snapshot = entries.slice();
  listeners.forEach((listener) => listener(snapshot));
};

export const redactSensitiveValue = (value: unknown): string => {
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
    scope: redactText(scope),
    message: redactText(message),
    detail: detail == null ? undefined : redactSensitiveValue(detail),
    createdAt: Date.now(),
  });
  if (entries.length > MAX_RECENT_LOGS) {
    entries.splice(MAX_RECENT_LOGS);
  }
  emit();
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
  subscribe(listener: (logs: LocalLogEntry[]) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  exportText(limit = MAX_RECENT_LOGS): string {
    return entries
      .slice(0, limit)
      .reverse()
      .map((entry) => {
        const timestamp = new Date(entry.createdAt).toISOString();
        const parts = [`[${timestamp}]`, entry.level.toUpperCase(), `${entry.scope}:`, entry.message];
        if (entry.detail) {
          parts.push(`| ${entry.detail}`);
        }
        return parts.join(' ');
      })
      .join('\n');
  },
  clear() {
    entries.length = 0;
    emit();
  },
};
