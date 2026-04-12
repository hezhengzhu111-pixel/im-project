import { ref } from "vue";
import { defineStore } from "pinia";
import { friendService, userService } from "@/services";
import type { AddFriendRequest, FriendRequest, Friendship, User } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export const useContactStore = defineStore("contact", () => {
  const { capture } = useErrorHandler("contact-store");
  const friends = ref<Friendship[]>([]);
  const friendRequests = ref<FriendRequest[]>([]);
  const loading = ref(false);

  const loadFriends = async () => {
    loading.value = true;
    try {
      const response = await friendService.getList();
      friends.value = response.data;
      return friends.value;
    } catch (error) {
      capture(error, "加载好友列表失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const loadFriendRequests = async () => {
    try {
      const response = await friendService.getRequests();
      friendRequests.value = response.data;
      return friendRequests.value;
    } catch (error) {
      capture(error, "加载好友申请失败");
      throw error;
    }
  };

  const searchUsers = async (params: {
    type: string;
    keyword: string;
  }): Promise<User[]> => {
    try {
      const response = await userService.search(params.keyword, params.type);
      return response.data;
    } catch (error) {
      capture(error, "搜索用户失败");
      throw error;
    }
  };

  const sendFriendRequest = async (params: AddFriendRequest) => {
    const response = await friendService.add(params);
    return response.data;
  };

  const acceptFriendRequest = async (requestId: string) => {
    await friendService.handleRequest({ requestId, action: "ACCEPT" });
  };

  const rejectFriendRequest = async (requestId: string) => {
    await friendService.handleRequest({ requestId, action: "REJECT" });
  };

  const deleteFriend = async (friendId: string) => {
    await friendService.delete(friendId);
    friends.value = friends.value.filter((item) => item.friendId !== friendId);
  };

  const updateFriendRemark = async (friendId: string, remark: string) => {
    await friendService.updateRemark(friendId, remark);
    friends.value = friends.value.map((friend) => {
      if (friend.friendId !== friendId) {
        return friend;
      }
      return {
        ...friend,
        remark,
      };
    });
  };

  const clear = () => {
    friends.value = [];
    friendRequests.value = [];
  };

  return {
    friends,
    friendRequests,
    loading,
    loadFriends,
    loadFriendRequests,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    deleteFriend,
    updateFriendRemark,
    clear,
  };
});
