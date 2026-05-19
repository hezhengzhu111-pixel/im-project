import { base64ToBytes, bytesToBase64 } from "./bytes";
import {
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  type RustE2eeEnvelope,
} from "./types";

export const OLD_E2EE_UNREADABLE_TEXT = "旧加密消息不可解密，请重新发送";

export const isRustE2eeEnvelope = (value: unknown): value is RustE2eeEnvelope => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<RustE2eeEnvelope>;
  return (
    record.version === RUST_E2EE_ENVELOPE_VERSION &&
    record.algorithm === RUST_E2EE_ALGORITHM &&
    typeof record.senderDeviceId === "string" &&
    typeof record.recipientDeviceId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.wire === "string" &&
    (record.handshake == null || typeof record.handshake === "string")
  );
};

export const parseE2eeEnvelope = (value: unknown): RustE2eeEnvelope | null => {
  if (isRustE2eeEnvelope(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRustE2eeEnvelope(parsed) ? parsed : null;
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
