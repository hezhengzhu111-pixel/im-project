import type { AiApiKey } from "@im/shared-types";
import { asBoolean, asString, isRecord } from "@im/shared-types";

export const normalizeAiApiKey = (raw: unknown): AiApiKey => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id),
    provider: asString(record.provider),
    keyName: asString(record.keyName),
    maskedKey: asString(record.maskedKey),
    isActive: asBoolean(record.isActive),
    validateStatus: asString(record.validateStatus),
    lastValidatedAt:
      record.lastValidatedAt != null
        ? asString(record.lastValidatedAt)
        : undefined,
  };
};
