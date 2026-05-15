import { AI_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { normalizeAiKey, normalizeAiSettings } from '@/utils/normalizers';
import type { AiApiKey, AiSettings, ApiResponse } from '@im/shared-types';

export const aiService = {
  async listKeys(): Promise<ApiResponse<AiApiKey[]>> {
    const response = await http.get<unknown[]>(AI_ENDPOINTS.KEYS);
    return { ...response, data: Array.isArray(response.data) ? response.data.map(normalizeAiKey) : [] };
  },
  async createKey(data: { provider: string; apiKey: string; keyName?: string }): Promise<ApiResponse<AiApiKey>> {
    const response = await http.post<unknown>(AI_ENDPOINTS.KEYS, data);
    return { ...response, data: normalizeAiKey(response.data) };
  },
  async updateKey(id: string, data: { apiKey?: string; keyName?: string }): Promise<ApiResponse<AiApiKey>> {
    const response = await http.put<unknown>(AI_ENDPOINTS.KEY_BY_ID.replace(':id', id), data);
    return { ...response, data: normalizeAiKey(response.data) };
  },
  deleteKey: (id: string) => http.delete<{ deleted: boolean }>(AI_ENDPOINTS.KEY_BY_ID.replace(':id', id)),
  testKey: (id: string) => http.post<{ validateStatus: string }>(AI_ENDPOINTS.KEY_TEST.replace(':id', id)),

  async getSettings(): Promise<ApiResponse<AiSettings>> {
    const response = await http.get<unknown>(AI_ENDPOINTS.SETTINGS);
    return { ...response, data: normalizeAiSettings(response.data) };
  },

  async updateSettings(data: Partial<AiSettings>): Promise<ApiResponse<AiSettings>> {
    const response = await http.put<unknown>(AI_ENDPOINTS.SETTINGS, data);
    return { ...response, data: normalizeAiSettings(response.data) };
  },
};
