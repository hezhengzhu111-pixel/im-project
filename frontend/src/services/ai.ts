import { http } from "@/utils/request";
import type { ApiResponse } from "@/types/api";

export interface AiApiKey {
  id: number;
  provider: string;
  keyName: string;
  maskedKey: string;
  isActive: boolean;
  validateStatus: string;
  lastValidatedAt?: number;
}

export interface AiSettings {
  autoReplyEnabled: boolean;
  autoReplyPersona: string;
}

export const aiService = {
  listKeys: () => http.get<AiApiKey[]>("/ai/keys"),

  createKey: (data: { provider: string; apiKey: string; keyName?: string }) =>
    http.post<AiApiKey>("/ai/keys", data),

  updateKey: (id: number, data: { apiKey?: string; keyName?: string }) =>
    http.put<AiApiKey>(`/ai/keys/${id}`, data),

  deleteKey: (id: number) => http.delete<{ deleted: boolean }>(`/ai/keys/${id}`),

  testKey: (id: number) => http.post<{ validateStatus: string }>(`/ai/keys/${id}/test`),

  getSettings: () => http.get<AiSettings>("/ai/settings"),

  updateSettings: (data: { autoReplyEnabled?: boolean; autoReplyPersona?: string }) =>
    http.put<AiSettings>("/ai/settings", data),
};
