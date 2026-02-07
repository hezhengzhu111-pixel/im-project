import { http } from "@/utils/request";
import type { Group, GroupMember, CreateGroupRequest, UpdateGroupRequest } from "@/types/group";

export const groupService = {
  create: (data: CreateGroupRequest) => http.post<Group>("/group/create", data),
  getList: (userId: string) => http.get<Group[]>(`/group/user/${userId}`),
  getMembers: (groupId: string) => http.post<GroupMember[]>("/group/members/list", { groupId }),
  join: (groupId: string) => http.post<void>(`/group/${groupId}/join`),
  quit: (groupId: string) => http.post<void>(`/group/${groupId}/leave`),
  dismiss: (groupId: string) => http.delete<void>(`/group/${groupId}`),
  update: (groupId: string, data: UpdateGroupRequest) => http.put<Group>(`/group/${groupId}`, data),
};
