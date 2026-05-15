import { FRIEND_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { normalizeFriendRequest, normalizeFriendship } from '@/utils/normalizers';
import type { ApiResponse, FriendRequest, Friendship } from '@im/shared-types';

export const friendService = {
  async getList(): Promise<ApiResponse<Friendship[]>> {
    const response = await http.get<unknown[]>(FRIEND_ENDPOINTS.LIST);
    return {
      ...response,
      data: Array.isArray(response.data) ? response.data.map(normalizeFriendship) : [],
    };
  },

  add: (data: { userId: string; message?: string }) =>
    http.post<void>(FRIEND_ENDPOINTS.REQUEST, {
      targetUserId: data.userId,
      reason: data.message,
    }),

  async getRequests(): Promise<ApiResponse<FriendRequest[]>> {
    const response = await http.get<unknown>(FRIEND_ENDPOINTS.REQUESTS);
    const list = Array.isArray(response.data)
      ? response.data
      : Array.isArray((response.data as { records?: unknown[] })?.records)
        ? (response.data as { records: unknown[] }).records
        : [];
    return { ...response, data: list.map(normalizeFriendRequest) };
  },

  handleRequest: (data: { requestId: string; action: 'ACCEPT' | 'REJECT' }) =>
    http.post<void>(data.action === 'ACCEPT' ? FRIEND_ENDPOINTS.ACCEPT : FRIEND_ENDPOINTS.REJECT, data),

  delete: (friendId: string) => http.delete<void>(FRIEND_ENDPOINTS.REMOVE, {
    params: { friendUserId: friendId },
  } as never),

  updateRemark: (friendId: string, remark: string) =>
    http.put<void>(FRIEND_ENDPOINTS.REMARK, undefined, {
      params: { friendUserId: friendId, remark },
    } as never),
};
