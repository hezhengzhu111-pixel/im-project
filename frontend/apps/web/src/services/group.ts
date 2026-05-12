import { http } from "@/utils/request";
import { normalizeGroup, normalizeGroupMember } from "@/normalizers/group";
import { GROUP_ENDPOINTS } from "@im/shared-api-contract";
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
    const response = await http.post<RawGroupDTO>(GROUP_ENDPOINTS.CREATE, data);
    if (response.code === 200 && response.data) {
      return { ...response, data: normalizeGroup(response.data) };
    }
    return response as unknown as ApiResponse<Group>;
  },
  async getList(userId: string): Promise<ApiResponse<Group[]>> {
    const response = await http.get<RawGroupDTO[]>(GROUP_ENDPOINTS.USER_GROUPS.replace(":userId", userId));
    if (response.code === 200 && Array.isArray(response.data)) {
      return {
        ...response,
        data: response.data.map((item) => normalizeGroup(item)),
      };
    }
    return response as unknown as ApiResponse<Group[]>;
  },
  getMembers: (groupId: string): Promise<ApiResponse<GroupMember[]>> =>
    http
      .post<{ members?: unknown[] }>(GROUP_ENDPOINTS.MEMBERS_LIST, {
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
  join: (groupId: string) => http.post<void>(GROUP_ENDPOINTS.JOIN.replace(":groupId", groupId)),
  addMembers: (groupId: string, memberIds: string[]) =>
    http.post<void>(GROUP_ENDPOINTS.ADD_MEMBERS.replace(":groupId", groupId), {
      memberIds: memberIds.map(Number),
    }),
  searchGroups: (keyword: string): Promise<ApiResponse<Group[]>> =>
    http
      .get<RawGroupDTO[]>(GROUP_ENDPOINTS.SEARCH, { params: { q: keyword } })
      .then((response) => {
        if (response.code === 200 && Array.isArray(response.data)) {
          return {
            ...response,
            data: response.data.map((item) => normalizeGroup(item)),
          };
        }
        return response as unknown as ApiResponse<Group[]>;
      }),
  quit: (groupId: string) => http.post<void>(GROUP_ENDPOINTS.LEAVE.replace(":groupId", groupId)),
  dismiss: (groupId: string) => http.delete<void>(GROUP_ENDPOINTS.DISMISS.replace(":groupId", groupId)),
  update: (groupId: string, data: UpdateGroupRequest, operatorId?: string) =>
    http
      .put<RawGroupDTO>(GROUP_ENDPOINTS.UPDATE.replace(":groupId", groupId), {
        ...data,
        groupId: String(groupId),
        operatorId: String(operatorId || ""),
      })
      .then((response) => {
        if (response.code === 200 && response.data) {
          return { ...response, data: normalizeGroup(response.data) };
        }
        return response as unknown as ApiResponse<Group>;
      }),
};
