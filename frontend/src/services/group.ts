import { http } from "@/utils/request";
import { normalizeGroup, normalizeGroupMember } from "@/normalizers/group";
import type {
  Group,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
  RawGroupDTO,
} from "@/types/group";
import type { ApiResponse } from "@/types/api";

export const groupService = {
  async create(data: CreateGroupRequest): Promise<ApiResponse<Group>> {
    const response = await http.post<RawGroupDTO>("/group/create", data);
    if (response.code === 200 && response.data) {
      return { ...response, data: normalizeGroup(response.data) };
    }
    return response as unknown as ApiResponse<Group>;
  },
  async getList(userId: string): Promise<ApiResponse<Group[]>> {
    const response = await http.get<RawGroupDTO[]>(`/group/user/${userId}`);
    if (response.code === 200 && Array.isArray(response.data)) {
      return {
        ...response,
        data: response.data.map((item) => normalizeGroup(item)),
      };
    }
    return response as unknown as ApiResponse<Group[]>;
  },
  getMembers: (groupId: string) =>
    http
      .post<{ members?: unknown[] }>("/group/members/list", {
        groupId: String(groupId),
      })
      .then((response) => {
        if (response.code === 200) {
          const members = (response.data?.members || []).map((item) =>
            normalizeGroupMember(item),
          );
          return { ...response, data: members } as ApiResponse<GroupMember[]>;
        }
        return response as unknown as ApiResponse<GroupMember[]>;
      }),
  join: (groupId: string) => http.post<void>(`/group/${groupId}/join`),
  quit: (groupId: string) => http.post<void>(`/group/${groupId}/leave`),
  dismiss: (groupId: string) => http.delete<void>(`/group/${groupId}`),
  update: (groupId: string, data: UpdateGroupRequest, operatorId?: string) =>
    http.put<RawGroupDTO>(`/group/${groupId}`, {
      ...data,
      groupId: String(groupId),
      operatorId: String(operatorId || ""),
    }).then((response) => {
      if (response.code === 200 && response.data) {
        return { ...response, data: normalizeGroup(response.data) };
      }
      return response as unknown as ApiResponse<Group>;
    }),
};
