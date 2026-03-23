import { ref, computed, reactive } from "vue";
import { pinyin } from "pinyin-pro";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { ElMessage } from "element-plus";
import type { UserInfo, FriendListDTO } from "@/types"; // Adjust path if needed

export function useChatLogic() {
  const chatStore = useChatStore();
  const userStore = useUserStore();

  const activeTab = ref("chat");
  const searchKeyword = ref("");
  const showAddFriend = ref(false);
  const showCreateGroup = ref(false);
  const userSearchResults = ref<UserInfo[]>([]);
  const isSearchingUsers = ref(false);

  // Forms
  const addFriendForm = reactive({
    targetUserId: "",
    message: "我想加您为好友",
  });

  const createGroupForm = reactive({
    name: "",
    description: "",
    memberIds: [] as string[],
  });

  // Computed
  const filteredSessions = computed(() => {
    if (!searchKeyword.value) return chatStore.sortedSessions;
    return chatStore.sortedSessions.filter((session) =>
      session.targetName
        .toLowerCase()
        .includes(searchKeyword.value.toLowerCase()),
    );
  });

  const filteredContacts = computed(() => {
    let contacts = chatStore.friends;
    if (searchKeyword.value) {
      contacts = chatStore.friends.filter((contact) =>
        (contact.nickname || contact.username || "")
          .toLowerCase()
          .includes(searchKeyword.value.toLowerCase()),
      );
    }
    return contacts;
  });

  const groupedContacts = computed(() => {
    const groups: Record<string, FriendListDTO[]> = {};
    const contacts = filteredContacts.value;

    contacts.forEach((contact) => {
      const name = contact.nickname || contact.username || "";
      let firstChar = name[0].toUpperCase();

      if (/[\u4e00-\u9fa5]/.test(firstChar)) {
        firstChar = pinyin(firstChar, {
          pattern: "first",
          toneType: "none",
        }).toUpperCase();
      }

      if (!/[A-Z]/.test(firstChar)) {
        firstChar = "#";
      }

      if (!groups[firstChar]) {
        groups[firstChar] = [];
      }
      groups[firstChar].push(contact);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((key) => ({
      key,
      contacts: groups[key],
    }));
  });

  const filteredGroups = computed(() => {
    if (!searchKeyword.value) return chatStore.groups;
    return chatStore.groups.filter((group) =>
      (group.groupName || group.name || "")
        .toLowerCase()
        .includes(searchKeyword.value.toLowerCase()),
    );
  });

  const contactsForTransfer = computed(() => {
    return chatStore.friends.map((contact) => ({
      key: contact.friendId,
      label: contact.nickname,
    }));
  });

  // Actions
  const handleUserSearch = async (query: string) => {
    if (query.trim()) {
      isSearchingUsers.value = true;
      try {
        const users = await chatStore.searchUsers({
          type: "username",
          keyword: query,
        });
        userSearchResults.value = users.filter(
          (user) => user.id !== userStore.userId,
        );
      } catch (error) {
        console.error("搜索用户失败:", error);
        userSearchResults.value = [];
      } finally {
        isSearchingUsers.value = false;
      }
    } else {
      userSearchResults.value = [];
    }
  };

  const handleSearch = async () => {
    if (!searchKeyword.value.trim()) {
      userSearchResults.value = [];
      return;
    }
    await handleUserSearch(searchKeyword.value);
  };

  const addFriend = async () => {
    if (!addFriendForm.targetUserId) {
      ElMessage.warning("请选择用户");
      return;
    }

    try {
      await chatStore.sendFriendRequest({
        userId: addFriendForm.targetUserId,
        message: addFriendForm.message,
      });

      ElMessage.success("好友请求已发送");
      showAddFriend.value = false;
      addFriendForm.targetUserId = "";
      addFriendForm.message = "我想加您为好友";
      userSearchResults.value = [];
    } catch (error: any) {
      ElMessage.error(error.message || "添加好友失败");
    }
  };

  const createGroup = async () => {
    try {
      await chatStore.createGroup({
        name: createGroupForm.name,
        description: createGroupForm.description,
        memberIds: createGroupForm.memberIds,
      });
      ElMessage.success("群组创建成功");
      showCreateGroup.value = false;
      Object.assign(createGroupForm, {
        name: "",
        description: "",
        memberIds: [],
      });
    } catch (error: any) {
      ElMessage.error(error.message || "创建群组失败");
    }
  };

  return {
    activeTab,
    searchKeyword,
    showAddFriend,
    showCreateGroup,
    userSearchResults,
    isSearchingUsers,
    addFriendForm,
    createGroupForm,
    filteredSessions,
    groupedContacts,
    filteredGroups,
    contactsForTransfer,
    handleSearch,
    handleUserSearch,
    addFriend,
    createGroup,
  };
}
