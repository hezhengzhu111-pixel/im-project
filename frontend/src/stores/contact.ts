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
          this.pendingRequests = (response.data || []).map((item: any) => ({
            id: String(item.id || ""),
            applicantId: String(item.fromUserId || item.applicantId || ""),
            applicantUsername: String(item.fromUser?.username || item.applicantUsername || ""),
            applicantNickname:
              item.fromUser?.nickname ||
              item.applicantNickname ||
              item.applicantName ||
              "",
            applicantAvatar:
              item.fromUser?.avatar || item.applicantAvatar || "",
            reason: item.message || item.reason || "",
            status: item.status || "PENDING",
            createTime: item.createTime || "",
          }));
        }
      } catch (error) {
        console.error("加载待处理好友申请失败:", error);
      }
    },
  },
});
