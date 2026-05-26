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

// ── SHA-256 pure JS fallback（HTTP 环境下 crypto.subtle 不可用） ──

const sha256PureJS = (input: string): string => {
  const raw = new TextEncoder().encode(input);
  const msgBytes: number[] = Array.from(raw);
  // SHA-256 constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  // Initial hash values
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  // Padding
  const ml = msgBytes.length * 8;
  msgBytes.push(0x80);
  while ((msgBytes.length + 8) % 64 !== 0) msgBytes.push(0x00);
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, Math.floor(ml / 0x100000000), false);
  view.setUint32(4, ml >>> 0, false);
  for (let i = 0; i < 8; i++) msgBytes.push(view.getUint8(i));
  // Process blocks
  for (let i = 0; i < msgBytes.length; i += 64) {
    const W = new Array(64) as number[];
    for (let t = 0; t < 16; t++) {
      W[t] = (msgBytes[i + t * 4]! << 24) | (msgBytes[i + t * 4 + 1]! << 16) | (msgBytes[i + t * 4 + 2]! << 8) | msgBytes[i + t * 4 + 3]!;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(W[t - 15]!, 7) ^ rotr(W[t - 15]!, 18) ^ (W[t - 15]! >>> 3)) >>> 0;
      const s1 = (rotr(W[t - 2]!, 17) ^ rotr(W[t - 2]!, 19) ^ (W[t - 2]! >>> 10)) >>> 0;
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t]! + W[t]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0; H[1] = (H[1]! + b) >>> 0; H[2] = (H[2]! + c) >>> 0; H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0; H[5] = (H[5]! + f) >>> 0; H[6] = (H[6]! + g) >>> 0; H[7] = (H[7]! + h) >>> 0;
  }
  // Output hex
  let hex = "";
  for (const v of H) hex += v.toString(16).padStart(8, "0");
  return hex;
};

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

const sha256Hex = async (input: string): Promise<string> => {
  const cryptoLike = globalThis.crypto;
  if (cryptoLike && typeof cryptoLike.subtle?.digest === "function") {
    try {
      const encoded = new TextEncoder().encode(input);
      const hash = await cryptoLike.subtle.digest("SHA-256", encoded);
      return bytesToHex(new Uint8Array(hash));
    } catch {
      // 安全上下文不可用时回退到纯 JS
    }
  }
  return sha256PureJS(input);
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
