import { http } from "@/utils/request";
import { extractFriendRequestList } from "@/normalizers/friendRequest";
import { normalizeFriendRequest, normalizeFriendship } from "@/normalizers/user";
import type {
  Friendship,
  FriendRequest,
  AddFriendRequest,
  HandleFriendRequestRequest,
} from "@/types/user";

export const friendService = {
  async getList() {
    const response = await http.get<unknown[]>("/friend/list");
    return {
      ...response,
      data: Array.isArray(response.data)
        ? response.data.map((item) => normalizeFriendship(item))
        : [],
    } as typeof response & { data: Friendship[] };
  },
  add: (data: AddFriendRequest) =>
    http.post<void>("/friend/request", {
      targetUserId: data.userId,
      reason: data.message,
    }),
  async getRequests() {
    const response = await http.get<unknown>("/friend/requests");
    const requestList = extractFriendRequestList(response.data);
    return {
      ...response,
      data: requestList.map((item) => normalizeFriendRequest(item)),
    } as typeof response & { data: FriendRequest[] };
  },
  handleRequest: (data: HandleFriendRequestRequest) =>
    http.post<void>(
      data.action === "ACCEPT" ? "/friend/accept" : "/friend/reject",
      data,
    ),
  delete: (friendId: string) =>
    http.delete<void>("/friend/remove", { friendUserId: friendId }),
  updateRemark: (friendId: string, remark: string) =>
    http.put<void>("/friend/remark", undefined, {
      params: { friendUserId: friendId, remark },
    }),
};
