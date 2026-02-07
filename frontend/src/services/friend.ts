import { http } from "@/utils/request";
import type { Friendship, FriendRequest, AddFriendRequest, HandleFriendRequestRequest } from "@/types/user";

export const friendService = {
  getList: () => http.get<Friendship[]>("/friend/list"),
  add: (data: AddFriendRequest) =>
    http.post<void>("/friend/request", {
      targetUserId: data.userId,
      reason: data.message,
    }),
  getRequests: () => http.get<FriendRequest[]>("/friend/requests"),
  handleRequest: (data: HandleFriendRequestRequest) =>
    http.post<void>(data.action === "ACCEPT" ? "/friend/accept" : "/friend/reject", data),
  delete: (friendId: string) => http.delete<void>("/friend/remove", { friendUserId: friendId }),
  updateRemark: (friendId: string, remark: string) =>
    http.put<void>("/friend/remark", { friendUserId: friendId, remark }),
};
