import { http } from "@/utils/request";
import type { Friendship, FriendRequest, AddFriendRequest, HandleFriendRequestRequest } from "@/types/user";

export const friendService = {
  getList: () => http.get<Friendship[]>("/v1/friend/list"),
  add: (data: AddFriendRequest) => http.post<void>("/v1/friend/request", data),
  getRequests: () => http.get<FriendRequest[]>("/v1/friend/requests"),
  handleRequest: (data: HandleFriendRequestRequest) => http.post<void>(data.action === 'ACCEPT' ? "/v1/friend/accept" : "/v1/friend/reject", data),
  delete: (friendId: string) => http.delete<void>(`/v1/friend/remove?friendUserId=${friendId}`),
  updateRemark: (friendId: string, remark: string) => http.put<void>("/v1/friend/remark", { friendUserId: friendId, remark }),
};
