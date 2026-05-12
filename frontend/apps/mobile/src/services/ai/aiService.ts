import { AI_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { normalizeAiKey } from '@/utils/normalizers';
import type { AiApiKey, AiSettings, ApiResponse } from '@/types/models';

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
  getSettings: () => http.get<AiSettings>(AI_ENDPOINTS.SETTINGS),
  updateSettings: (data: Partial<AiSettings>) => http.put<AiSettings>(AI_ENDPOINTS.SETTINGS, data),
};
