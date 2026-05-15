import { GROUP_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { isRecord, normalizeGroup, normalizeGroupMember } from '@/utils/normalizers';
import type { ApiResponse, Group, GroupMember } from '@im/shared-types';

export const groupService = {
  async create(data: { name: string; description?: string; avatar?: string; memberIds: string[] }): Promise<ApiResponse<Group>> {
    const response = await http.post<unknown>(GROUP_ENDPOINTS.CREATE, {
      name: data.name,
      type: 1,
      announcement: data.description,
      avatar: data.avatar,
      memberIds: data.memberIds,
    });
    return { ...response, data: normalizeGroup(response.data) };
  },

  async getList(userId: string): Promise<ApiResponse<Group[]>> {
    const response = await http.get<unknown[]>(GROUP_ENDPOINTS.USER_GROUPS.replace(':userId', userId));
    return { ...response, data: Array.isArray(response.data) ? response.data.map(normalizeGroup) : [] };
  },

  async getMembers(groupId: string): Promise<ApiResponse<GroupMember[]>> {
    const response = await http.post<unknown>(GROUP_ENDPOINTS.MEMBERS_LIST, { groupId });
    const members = isRecord(response.data) && Array.isArray(response.data.members) ? response.data.members : [];
    return { ...response, data: members.map(normalizeGroupMember) };
  },

  join: (groupId: string) => http.post<void>(GROUP_ENDPOINTS.JOIN.replace(':groupId', groupId)),
  addMembers: (groupId: string, memberIds: string[]) =>
    http.post<void>(GROUP_ENDPOINTS.ADD_MEMBERS.replace(':groupId', groupId), { memberIds: memberIds.map(Number) }),

  async searchGroups(keyword: string): Promise<ApiResponse<Group[]>> {
    const response = await http.get<unknown[]>(GROUP_ENDPOINTS.SEARCH, { params: { q: keyword } } as never);
    return { ...response, data: Array.isArray(response.data) ? response.data.map(normalizeGroup) : [] };
  },

  quit: (groupId: string) => http.post<void>(GROUP_ENDPOINTS.LEAVE.replace(':groupId', groupId)),
  dismiss: (groupId: string) => http.delete<void>(GROUP_ENDPOINTS.DISMISS.replace(':groupId', groupId)),
  async update(groupId: string, data: Record<string, unknown>, operatorId?: string): Promise<ApiResponse<Group>> {
    const response = await http.put<unknown>(GROUP_ENDPOINTS.UPDATE.replace(':groupId', groupId), {
      ...data,
      groupId,
      operatorId: operatorId || '',
    });
    return { ...response, data: normalizeGroup(response.data) };
  },
};
