const E2EE_REDACTED = "[REDACTED:E2EE]";
const E2EE_REDACTED_STRING = "[REDACTED:E2EE_STRING]";
const MAX_SAFE_STRING_LENGTH = 160;

const SENSITIVE_KEY_PARTS = [
  "plaintext",
  "ciphertext",
  "content",
  "mediakey",
  "rootkey",
  "chainkey",
  "messagekey",
  "privatekey",
  "identitykey",
  "signingidentitykey",
  "signedprekey",
  "onetimeprekey",
  "e2eeheader",
  "ratchetpublickey",
  "ephemeralkey",
  "e2eesenderidentitykey",
  "e2eeephemeralkey",
  "requestpayloadjson",
  "ratchetstate",
  "iv",
];

const shouldRedactKey = (key: string): boolean => {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
};

const looksLikeSensitiveString = (value: string): boolean => {
  if (value.length > MAX_SAFE_STRING_LENGTH) {
    return true;
  }
  return value.length >= 64 && /^[A-Za-z0-9+/=_-]+$/.test(value);
};

const sanitizeInternal = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return looksLikeSensitiveString(value) ? E2EE_REDACTED_STRING : value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInternal(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    sanitized[key] = shouldRedactKey(key) ? E2EE_REDACTED : sanitizeInternal(child, seen);
  }
  return sanitized;
};

export const sanitizeE2eeLogValue = (value: unknown): unknown =>
  sanitizeInternal(value, new WeakSet<object>());

