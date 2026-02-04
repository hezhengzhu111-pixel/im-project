import { http } from "@/utils/request";
import type { Group, GroupMember, CreateGroupRequest, UpdateGroupRequest } from "@/types/group";

export const groupService = {
  create: (data: CreateGroupRequest) => http.post<Group>("/v1/groups/create", data),
  getList: (userId?: string) => http.get<Group[]>(userId ? `/v1/groups/user/${userId}` : "/v1/groups/user/{userId}"),
  getMembers: (groupId: string) => http.post<GroupMember[]>(`/v1/groups/members/list`, { groupId }),
  join: (groupId: string) => http.post<void>(`/v1/groups/${groupId}/join`),
  quit: (groupId: string) => http.post<void>(`/v1/groups/${groupId}/leave`),
  dismiss: (groupId: string) => http.delete<void>(`/v1/groups/${groupId}`),
  update: (groupId: string, data: UpdateGroupRequest) => http.put<Group>(`/v1/groups/${groupId}`, data),
  getInvites: () => http.get<any[]>("/v1/groups/invites"),
  handleInvite: (inviteId: string, action: 'ACCEPT' | 'REJECT') => http.post<void>("/v1/groups/invite/handle", { inviteId, action }),
};
