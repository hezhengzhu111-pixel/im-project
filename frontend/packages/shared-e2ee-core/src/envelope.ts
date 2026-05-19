import { base64ToBytes, bytesToBase64 } from "./bytes";
import {
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  type RustE2eeEnvelope,
} from "./types";

export const OLD_E2EE_UNREADABLE_TEXT = "旧加密消息不可解密，请重新发送";

/**
 * 判断是否为 Rust E2EE v2 envelope。
 *
 * 兼容后端序列化字段 `algorithm` 和历史字段 `alg`。
 * 要求 sessionId、senderDeviceId、recipientDeviceId、wire 均为非空字符串。
 */
export const isRustE2eeEnvelope = (value: unknown): value is RustE2eeEnvelope => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  const algorithm = (record.algorithm || record.alg) as string | undefined;
  return (
    record.version === RUST_E2EE_ENVELOPE_VERSION &&
    algorithm === RUST_E2EE_ALGORITHM &&
    typeof record.senderDeviceId === "string" && record.senderDeviceId.length > 0 &&
    typeof record.recipientDeviceId === "string" && record.recipientDeviceId.length > 0 &&
    typeof record.sessionId === "string" && record.sessionId.length > 0 &&
    typeof record.wire === "string" && record.wire.length > 0 &&
    (record.handshake == null || typeof record.handshake === "string")
  );
};

/**
 * 将原始 envelope 归一化为统一的 RustE2eeEnvelope 格式。
 *
 * - 如果输入有 `alg` 但没有 `algorithm`，补上 `algorithm` 字段。
 * - 确保所有必需字段存在。
 */
export const normalizeEnvelope = (raw: unknown): RustE2eeEnvelope | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const algorithm = (r.algorithm || r.alg || "") as string;
  const senderDeviceId = (r.senderDeviceId || "") as string;
  const recipientDeviceId = (r.recipientDeviceId || "") as string;
  const sessionId = (r.sessionId || "") as string;
  const wire = (r.wire || "") as string;
  const handshake = r.handshake as string | undefined;

  if (
    r.version !== RUST_E2EE_ENVELOPE_VERSION ||
    algorithm !== RUST_E2EE_ALGORITHM ||
    !senderDeviceId ||
    !recipientDeviceId ||
    !sessionId ||
    !wire
  ) {
    return null;
  }

  return {
    version: RUST_E2EE_ENVELOPE_VERSION,
    algorithm: RUST_E2EE_ALGORITHM,
    senderDeviceId,
    recipientDeviceId,
    sessionId,
    handshake: handshake || undefined,
    wire,
  };
};

export const parseE2eeEnvelope = (value: unknown): RustE2eeEnvelope | null => {
  if (isRustE2eeEnvelope(value)) {
    return normalizeEnvelope(value);
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRustE2eeEnvelope(parsed) ? normalizeEnvelope(parsed) : null;
  } catch {
    return null;
  }
};

export const encodeE2eeEnvelope = (envelope: RustE2eeEnvelope): string =>
  JSON.stringify(envelope);

export const createE2eeEnvelope = (input: {
  senderDeviceId: string;
  recipientDeviceId: string;
  sessionId: string;
  wire: Uint8Array | string;
  handshake?: Uint8Array | string;
}): RustE2eeEnvelope => ({
  version: RUST_E2EE_ENVELOPE_VERSION,
  algorithm: RUST_E2EE_ALGORITHM,
  senderDeviceId: input.senderDeviceId,
  recipientDeviceId: input.recipientDeviceId,
  sessionId: input.sessionId,
  handshake:
    typeof input.handshake === "string"
      ? input.handshake
      : input.handshake
        ? bytesToBase64(input.handshake)
        : undefined,
  wire: typeof input.wire === "string" ? input.wire : bytesToBase64(input.wire),
});

export const envelopeWireBytes = (envelope: RustE2eeEnvelope): Uint8Array =>
  base64ToBytes(envelope.wire);

export const envelopeHandshakeBytes = (envelope: RustE2eeEnvelope): Uint8Array | null =>
  envelope.handshake ? base64ToBytes(envelope.handshake) : null;
