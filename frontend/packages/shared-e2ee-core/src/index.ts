export type E2eeSessionStatus = "plaintext" | "negotiating" | "encrypted" | "failed";

export type E2eeErrorCategory =
  | "state"
  | "negotiation"
  | "protocol"
  | "crypto"
  | "storage"
  | "platform"
  | "policy"
  | "unknown";

export type E2eeErrorCode =
  | "NO_RATCHET_STATE"
  | "NEGOTIATION_NOT_ACCEPTED"
  | "NEGOTIATION_REQUIRED"
  | "COUNTER_GAP"
  | "DUPLICATE_OR_EXPIRED_MESSAGE"
  | "MISSING_HEADER"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "KEY_STORE_FAILED"
  | "UNSUPPORTED_ON_MOBILE"
  | "PLAINTEXT_DOWNGRADE_BLOCKED"
  | "UNKNOWN";

export interface E2eeErrorClassification {
  code: E2eeErrorCode;
  category: E2eeErrorCategory;
  retryable: boolean;
  safeMessage: string;
}

export interface NoPlaintextDowngradeInput {
  attemptedPlaintext: boolean;
  sessionStatus?: E2eeSessionStatus | null;
  sessionEncrypted?: unknown;
  messageEncrypted?: unknown;
  pendingEncrypted?: unknown;
}

export class E2eePolicyError extends Error {
  readonly code: E2eeErrorCode;
  readonly category: E2eeErrorCategory;

  constructor(message: string, code: E2eeErrorCode, category: E2eeErrorCategory) {
    super(message);
    this.name = "E2eePolicyError";
    this.code = code;
    this.category = category;
  }
}

const E2EE_REDACTED = "[REDACTED:E2EE]";
const E2EE_REDACTED_STRING = "[REDACTED:E2EE_STRING]";
const MAX_SAFE_STRING_LENGTH = 160;

const SENSITIVE_KEY_PARTS = [
  "ciphertext",
  "plaintext",
  "content",
  "mediakey",
  "chunkivs",
  "identitykey",
  "signedprekey",
  "onetimeprekey",
  "rootkey",
  "chainkey",
  "messagekey",
  "privatekey",
  "dhprivatekey",
  "ratchetstate",
  "requestpayloadjson",
  "e2eeheader",
  "e2eesenderidentitykey",
  "e2eeephemeralkey",
  "ephemeralkey",
  "header",
  "iv",
];

const classifyByMessage = (message: string): E2eeErrorClassification => {
  const normalized = message.toLowerCase();

  if (normalized.includes("plaintext downgrade")) {
    return {
      code: "PLAINTEXT_DOWNGRADE_BLOCKED",
      category: "policy",
      retryable: false,
      safeMessage: "Plaintext downgrade blocked",
    };
  }
  if (
    normalized.includes("negotiation has not been accepted") ||
    normalized.includes("not been accepted")
  ) {
    return {
      code: "NEGOTIATION_NOT_ACCEPTED",
      category: "negotiation",
      retryable: true,
      safeMessage: "E2EE negotiation has not been accepted",
    };
  }
  if (normalized.includes("renegotiation required")) {
    return {
      code: "NEGOTIATION_REQUIRED",
      category: "negotiation",
      retryable: true,
      safeMessage: "E2EE session renegotiation required",
    };
  }
  if (normalized.includes("counter gap")) {
    return {
      code: "COUNTER_GAP",
      category: "protocol",
      retryable: true,
      safeMessage: "E2EE ratchet counter gap detected",
    };
  }
  if (normalized.includes("no ratchet state")) {
    return {
      code: "NO_RATCHET_STATE",
      category: "state",
      retryable: true,
      safeMessage: "E2EE ratchet state unavailable",
    };
  }
  if (normalized.includes("duplicate or expired")) {
    return {
      code: "DUPLICATE_OR_EXPIRED_MESSAGE",
      category: "protocol",
      retryable: false,
      safeMessage: "E2EE message is duplicate or expired",
    };
  }
  if (normalized.includes("header")) {
    return {
      code: "MISSING_HEADER",
      category: "protocol",
      retryable: false,
      safeMessage: "E2EE message header unavailable",
    };
  }
  if (normalized.includes("decrypt")) {
    return {
      code: "DECRYPTION_FAILED",
      category: "crypto",
      retryable: false,
      safeMessage: "E2EE decryption failed",
    };
  }
  if (normalized.includes("encrypt")) {
    return {
      code: "ENCRYPTION_FAILED",
      category: "crypto",
      retryable: false,
      safeMessage: "E2EE encryption failed",
    };
  }
  if (
    normalized.includes("indexeddb") ||
    normalized.includes("key store") ||
    normalized.includes("persist") ||
    normalized.includes("storage")
  ) {
    return {
      code: "KEY_STORE_FAILED",
      category: "storage",
      retryable: true,
      safeMessage: "E2EE key storage failed",
    };
  }
  if (normalized.includes("mobile") || normalized.includes("unsupported")) {
    return {
      code: "UNSUPPORTED_ON_MOBILE",
      category: "platform",
      retryable: false,
      safeMessage: "E2EE is unsupported on this platform",
    };
  }

  return {
    code: "UNKNOWN",
    category: "unknown",
    retryable: false,
    safeMessage: "Unknown E2EE error",
  };
};

export const classifyE2eeError = (error: unknown): E2eeErrorClassification => {
  if (error instanceof E2eePolicyError) {
    return {
      code: error.code,
      category: error.category,
      retryable: false,
      safeMessage: error.message,
    };
  }
  if (error instanceof Error) {
    return classifyByMessage(error.message);
  }
  if (typeof error === "string") {
    return classifyByMessage(error);
  }
  return classifyByMessage("");
};

export const isEncryptedValue = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

export const assertNoPlaintextDowngrade = (input: NoPlaintextDowngradeInput): void => {
  if (!input.attemptedPlaintext) {
    return;
  }

  const protectedStatus =
    input.sessionStatus === "negotiating" ||
    input.sessionStatus === "encrypted" ||
    input.sessionStatus === "failed";
  const protectedMarker =
    isEncryptedValue(input.sessionEncrypted) ||
    isEncryptedValue(input.messageEncrypted) ||
    isEncryptedValue(input.pendingEncrypted);

  if (protectedStatus || protectedMarker) {
    throw new E2eePolicyError(
      "Plaintext downgrade blocked",
      "PLAINTEXT_DOWNGRADE_BLOCKED",
      "policy",
    );
  }
};

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
