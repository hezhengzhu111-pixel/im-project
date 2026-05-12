import { http } from "@/utils/request";
import { extractFriendRequestList } from "@/normalizers/friendRequest";
import { FRIEND_ENDPOINTS } from "@im/shared-api-contract";
import {
  normalizeFriendRequest,
  normalizeFriendship,
} from "@/normalizers/user";
import type {
  Friendship,
  FriendRequest,
  AddFriendRequest,
  HandleFriendRequestRequest,
} from "@/types/user";

export const friendService = {
  async getList() {
    const response = await http.get<unknown[]>(FRIEND_ENDPOINTS.LIST);
    return {
      ...response,
      data: Array.isArray(response.data)
        ? response.data.map((item) => normalizeFriendship(item))
        : [],
    } as typeof response & { data: Friendship[] };
  },
  add: (data: AddFriendRequest) =>
    http.post<void>(FRIEND_ENDPOINTS.REQUEST, {
      targetUserId: data.userId,
      reason: data.message,
    }),
  async getRequests() {
    const response = await http.get<unknown>(FRIEND_ENDPOINTS.REQUESTS);
    const requestList = extractFriendRequestList(response.data);
    return {
      ...response,
      data: requestList.map((item) => normalizeFriendRequest(item)),
    } as typeof response & { data: FriendRequest[] };
  },
  handleRequest: (data: HandleFriendRequestRequest) =>
    http.post<void>(
      data.action === "ACCEPT" ? FRIEND_ENDPOINTS.ACCEPT : FRIEND_ENDPOINTS.REJECT,
      data,
    ),
  delete: (friendId: string) =>
    http.delete<void>(FRIEND_ENDPOINTS.REMOVE, { friendUserId: friendId }),
  updateRemark: (friendId: string, remark: string) =>
    http.put<void>(FRIEND_ENDPOINTS.REMARK, undefined, {
      params: { friendUserId: friendId, remark },
    }),
};
