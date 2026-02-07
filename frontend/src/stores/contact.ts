import { defineStore } from "pinia";
import { friendService } from "@/services";
import type { User, FriendRequest } from "@/types";

export const useContactStore = defineStore("contact", {
  state: () => ({
    contacts: [] as User[],
    pendingRequests: [] as FriendRequest[],
  }),

  actions: {
    async loadPendingRequests() {
      try {
        const response = await friendService.getRequests();
        if (response.code === 200) {
          this.pendingRequests = response.data;
        }
      } catch (error) {
        console.error("加载待处理好友申请失败:", error);
      }
    },
  },
});
