import { ref } from "vue";
import { defineStore } from "pinia";
import { groupService } from "@/services/group";
import { useUserStore } from "@/stores/user";
import type { Group } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export const useGroupStore = defineStore("group", () => {
  const { capture } = useErrorHandler("group-store");
  const groups = ref<Group[]>([]);
  const loading = ref(false);

  const loadGroups = async () => {
    const userStore = useUserStore();
    const userId = String(userStore.userId || "");
    if (!userId) {
      groups.value = [];
      return [];
    }
    loading.value = true;
    try {
      const response = await groupService.getList(userId);
      groups.value = response.data;
      return groups.value;
    } catch (error) {
      capture(error, "加载群组列表失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const createGroup = async (params: {
    name: string;
    description: string;
    avatar?: string;
    memberIds: string[];
  }) => {
    try {
      const response = await groupService.create({
        name: params.name,
        type: 1,
        announcement: params.description,
        avatar: params.avatar,
        memberIds: params.memberIds,
      });
      return response.data;
    } catch (error) {
      capture(error, "创建群组失败");
      throw error;
    }
  };

  const leaveGroup = async (groupId: string) => {
    try {
      await groupService.quit(groupId);
      groups.value = groups.value.filter((group) => group.id !== groupId);
    } catch (error) {
      capture(error, "退出群组失败");
      throw error;
    }
  };

  const clear = () => {
    groups.value = [];
  };

  return {
    groups,
    loading,
    loadGroups,
    createGroup,
    leaveGroup,
    clear,
  };
});
