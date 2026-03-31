import { http } from "@/utils/request";
import { useUserStore } from "@/stores/user";
import type {
  Group,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
} from "@/types/group";
import type { ApiResponse } from "@/types/api";

type RawGroup = Record<string, any>;

const normalizeGroup = (raw: RawGroup): Group => {
  const groupName = raw.groupName ?? raw.name ?? "";
  return {
    id: String(raw.id ?? ""),
    groupName,
    description: raw.description ?? raw.announcement ?? "",
    avatar: raw.avatar,
    ownerId: String(raw.ownerId ?? ""),
    memberCount: Number(raw.memberCount ?? 0),
    createTime: String(raw.createTime ?? ""),
    status: raw.status ?? "NORMAL",
  };
};

const normalizeMemberRole = (role: unknown): string => {
  if (role === 3 || role === "3" || role === "OWNER") return "OWNER";
  if (role === 2 || role === "2" || role === "ADMIN") return "ADMIN";
  return "MEMBER";
};

const normalizeGroupMember = (raw: Record<string, any>): GroupMember => ({
  userId: String(raw.userId ?? ""),
  username: String(raw.username ?? ""),
  nickname: String(raw.nickname ?? raw.username ?? ""),
  avatar: String(raw.avatar ?? ""),
  role: normalizeMemberRole(raw.role),
  joinTime: String(raw.joinTime ?? ""),
});

export const groupService = {
  async create(data: CreateGroupRequest): Promise<ApiResponse<Group>> {
    const response = await http.post<RawGroup>("/group/create", data);
    if (response.code === 200 && response.data) {
      return { ...response, data: normalizeGroup(response.data) };
    }
    return response as unknown as ApiResponse<Group>;
  },
  async getList(userId: string): Promise<ApiResponse<Group[]>> {
    const response = await http.get<RawGroup[]>(`/group/user/${userId}`);
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
      .post<{ members?: Record<string, any>[] }>("/group/members/list", {
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
    http.put<RawGroup>(`/group/${groupId}`, {
      ...data,
      groupId: String(groupId),
      operatorId: String(operatorId || useUserStore().userId || "")
    }).then((response) => {
      if (response.code === 200 && response.data) {
        return { ...response, data: normalizeGroup(response.data) };
      }
      return response as unknown as ApiResponse<Group>;
    }),
  addMembers: (groupId: string, memberIds: string[], operatorId: string) =>
    http.post<void>(`/group/${groupId}/members`, {
      groupId: String(groupId),
      operatorId: String(operatorId),
      memberIds: memberIds.map((item) => String(item)),
    }),
};
