import { asBase64String, base64ToBytes, bytesToBase64 } from "./bytes";

export const SESSION_STATE_ENVELOPE_VERSION = 3 as const;
export const SESSION_STATE_ALGORITHM = "rust-x25519-x3dh-dr-v1" as const;

export interface SessionStateEnvelope {
  version: typeof SESSION_STATE_ENVELOPE_VERSION;
  algorithm: typeof SESSION_STATE_ALGORITHM;
  userId: string;
  localDeviceId: string;
  sessionId: string;
  remoteUserIdHash: string;
  remoteDeviceId: string;
  createdAt: number;
  updatedAt: number;
  state: string;
  direction?: "outbound" | "inbound" | "established";
  localIdentityKeyFingerprint?: string;
  remoteIdentityKeyFingerprint?: string;
}

export interface SessionStateEnvelopeContext {
  userId: string;
  localDeviceId: string;
  sessionId: string;
  remoteUserId: string;
  remoteDeviceId: string;
}

const HEX_CHARS = "0123456789abcdef";

const bytesToHex = (bytes: Uint8Array): string => {
  let hex = "";
  for (const byte of bytes) {
    hex += HEX_CHARS[(byte >> 4) & 0xf];
    hex += HEX_CHARS[byte & 0xf];
  }
  return hex;
};

const sha256Hex = async (input: string): Promise<string> => {
  const cryptoLike = globalThis.crypto;
  if (!cryptoLike || typeof cryptoLike.subtle?.digest !== "function") {
    throw new Error("SHA-256 unavailable: crypto.subtle.digest is not accessible");
  }
  const encoded = new TextEncoder().encode(input);
  const hash = await cryptoLike.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(hash));
};

/** First 16 hex chars of SHA-256 — 64-bit fingerprint, sufficient for collision resistance in session context. */
const fingerprint = async (input: string): Promise<string> => {
  const full = await sha256Hex(input);
  return full.slice(0, 16);
};

const now = (): number => Date.now();

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Encode a raw session state (bincode bytes) into a version 3 envelope.
 *
 * The envelope binds the state to a specific user, device, session, and remote
 * peer so that cross-account or cross-device restore is detected and rejected.
 */
export const encodeSessionStateEnvelope = async (
  state: Uint8Array | string,
  context: SessionStateEnvelopeContext,
  options?: {
    direction?: SessionStateEnvelope["direction"];
    localIdentityKey?: string;
    remoteIdentityKey?: string;
    createdAt?: number;
  },
): Promise<SessionStateEnvelope> => {
  if (!isNonEmptyString(context.userId)) {
    throw new Error("SessionStateEnvelope requires userId");
  }
  if (!isNonEmptyString(context.localDeviceId)) {
    throw new Error("SessionStateEnvelope requires localDeviceId");
  }
  if (!isNonEmptyString(context.sessionId)) {
    throw new Error("SessionStateEnvelope requires sessionId");
  }
  if (!isNonEmptyString(context.remoteUserId)) {
    throw new Error("SessionStateEnvelope requires remoteUserId");
  }
  if (!isNonEmptyString(context.remoteDeviceId)) {
    throw new Error("SessionStateEnvelope requires remoteDeviceId");
  }

  const stateBase64 = typeof state === "string" ? asBase64String(state, "session state") : bytesToBase64(state);
  const timestamp = options?.createdAt ?? now();

  const envelope: SessionStateEnvelope = {
    version: SESSION_STATE_ENVELOPE_VERSION,
    algorithm: SESSION_STATE_ALGORITHM,
    userId: context.userId,
    localDeviceId: context.localDeviceId,
    sessionId: context.sessionId,
    remoteUserIdHash: await fingerprint(context.remoteUserId),
    remoteDeviceId: context.remoteDeviceId,
    createdAt: timestamp,
    updatedAt: timestamp,
    state: stateBase64,
    direction: options?.direction,
  };

  if (options?.localIdentityKey) {
    envelope.localIdentityKeyFingerprint = await fingerprint(options.localIdentityKey);
  }
  if (options?.remoteIdentityKey) {
    envelope.remoteIdentityKeyFingerprint = await fingerprint(options.remoteIdentityKey);
  }

  return envelope;
};

/**
 * Decode a stored value into a SessionStateEnvelope.
 *
 * Returns `null` when the stored value is missing, not an object, has an
 * unsupported version, or is missing required fields.
 */
export const decodeSessionStateEnvelope = (stored: unknown): SessionStateEnvelope | null => {
  if (!stored || typeof stored !== "object") {
    return null;
  }
  const record = stored as Record<string, unknown>;

  if (
    record.version !== SESSION_STATE_ENVELOPE_VERSION ||
    record.algorithm !== SESSION_STATE_ALGORITHM ||
    !isNonEmptyString(record.userId) ||
    !isNonEmptyString(record.localDeviceId) ||
    !isNonEmptyString(record.sessionId) ||
    !isNonEmptyString(record.remoteUserIdHash) ||
    !isNonEmptyString(record.remoteDeviceId) ||
    typeof record.createdAt !== "number" ||
    typeof record.updatedAt !== "number" ||
    !isNonEmptyString(record.state)
  ) {
    return null;
  }

  const direction = record.direction;
  if (direction !== undefined && direction !== "outbound" && direction !== "inbound" && direction !== "established") {
    return null;
  }

  return {
    version: SESSION_STATE_ENVELOPE_VERSION,
    algorithm: SESSION_STATE_ALGORITHM,
    userId: record.userId,
    localDeviceId: record.localDeviceId,
    sessionId: record.sessionId,
    remoteUserIdHash: record.remoteUserIdHash,
    remoteDeviceId: record.remoteDeviceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    state: record.state,
    direction,
    localIdentityKeyFingerprint: isNonEmptyString(record.localIdentityKeyFingerprint)
      ? record.localIdentityKeyFingerprint
      : undefined,
    remoteIdentityKeyFingerprint: isNonEmptyString(record.remoteIdentityKeyFingerprint)
      ? record.remoteIdentityKeyFingerprint
      : undefined,
  };
};

/**
 * Error thrown when a stored session state envelope does not match the
 * expected context (userId, localDeviceId, sessionId, remoteUserId,
 * remoteDeviceId).
 */
export class SessionStateContextMismatchError extends Error {
  readonly code = "E2EE_SESSION_STATE_CONTEXT_MISMATCH";
  readonly nonRetryable = true;
  readonly mismatchedFields: string[];

  constructor(mismatchedFields: string[], detail?: string) {
    super(
      `E2EE session state context mismatch: [${mismatchedFields.join(", ")}]` +
        (detail ? ` — ${detail}` : ""),
    );
    this.name = "SessionStateContextMismatchError";
    this.mismatchedFields = mismatchedFields;
  }
}

/**
 * Validate that a decoded envelope matches the expected context.
 *
 * Checks userId, localDeviceId, sessionId, remoteUserId (via hash), and
 * remoteDeviceId. Returns `true` when all fields match.
 *
 * Throws `SessionStateContextMismatchError` with the list of mismatched fields
 * when any field does not match.
 */
export const validateSessionStateEnvelopeContext = async (
  envelope: SessionStateEnvelope,
  context: SessionStateEnvelopeContext,
): Promise<boolean> => {
  const mismatched: string[] = [];

  if (envelope.userId !== context.userId) {
    mismatched.push("userId");
  }
  if (envelope.localDeviceId !== context.localDeviceId) {
    mismatched.push("localDeviceId");
  }
  if (envelope.sessionId !== context.sessionId) {
    mismatched.push("sessionId");
  }
  if (envelope.remoteDeviceId !== context.remoteDeviceId) {
    mismatched.push("remoteDeviceId");
  }

  const expectedHash = await fingerprint(context.remoteUserId);
  if (envelope.remoteUserIdHash !== expectedHash) {
    mismatched.push("remoteUserIdHash");
  }

  if (mismatched.length > 0) {
    throw new SessionStateContextMismatchError(mismatched);
  }

  return true;
};

/**
 * Serialize an envelope to a JSON string for storage.
 */
export const serializeSessionStateEnvelope = (envelope: SessionStateEnvelope): string =>
  JSON.stringify(envelope);

/**
 * Extract the raw state bytes from a decoded envelope.
 */
export const extractSessionStateBytes = (envelope: SessionStateEnvelope): Uint8Array =>
  base64ToBytes(envelope.state);
