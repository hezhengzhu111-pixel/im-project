import { http } from "@/utils/request";
import { AI_ENDPOINTS } from "@im/shared-api-contract";
import type { ApiResponse } from "@/types/api";

export interface AiApiKey {
  id: string;
  provider: string;
  keyName: string;
  maskedKey: string;
  isActive: boolean;
  validateStatus: string;
  lastValidatedAt?: string;
}

export interface AiSettings {
  autoReplyEnabled: boolean;
  autoReplyPersona: string;
}

function normalizeKey(raw: Record<string, unknown>): AiApiKey {
  return {
    id: String(raw.id ?? ""),
    provider: String(raw.provider ?? ""),
    keyName: String(raw.keyName ?? ""),
    maskedKey: String(raw.maskedKey ?? ""),
    isActive: Boolean(raw.isActive),
    validateStatus: String(raw.validateStatus ?? ""),
    lastValidatedAt:
      raw.lastValidatedAt != null ? String(raw.lastValidatedAt) : undefined,
  };
}

export const aiService = {
  listKeys: () =>
    http.get<unknown[]>(AI_ENDPOINTS.KEYS).then((r) => ({
      ...r,
      data: (r.data || []).map((item) =>
        normalizeKey(item as Record<string, unknown>),
      ),
    })) as Promise<ApiResponse<AiApiKey[]>>,

  createKey: (data: { provider: string; apiKey: string; keyName?: string }) =>
    http.post<Record<string, unknown>>(AI_ENDPOINTS.KEYS, data).then((r) => ({
      ...r,
      data: normalizeKey(r.data || {}),
    })) as Promise<ApiResponse<AiApiKey>>,

  updateKey: (id: string, data: { apiKey?: string; keyName?: string }) =>
    http.put<Record<string, unknown>>(AI_ENDPOINTS.KEY_BY_ID.replace(":id", id), data).then((r) => ({
      ...r,
      data: normalizeKey(r.data || {}),
    })) as Promise<ApiResponse<AiApiKey>>,

  deleteKey: (id: string) =>
    http.delete<{ deleted: boolean }>(AI_ENDPOINTS.KEY_BY_ID.replace(":id", id)),

  testKey: (id: string) =>
    http.post<{ validateStatus: string }>(AI_ENDPOINTS.KEY_TEST.replace(":id", id)),

  getSettings: () => http.get<AiSettings>(AI_ENDPOINTS.SETTINGS),

  updateSettings: (data: {
    autoReplyEnabled?: boolean;
    autoReplyPersona?: string;
  }) => http.put<AiSettings>(AI_ENDPOINTS.SETTINGS, data),
};
