<template>
  <el-dialog
    v-model="showAddFriend"
    title="添加好友"
    width="400px"
    append-to-body
  >
    <el-form :model="addFriendForm" label-width="80px">
      <el-form-item label="用户名">
        <el-select
          v-model="addFriendForm.targetUserId"
          filterable
          remote
          reserve-keyword
          placeholder="输入用户名搜索"
          :remote-method="handleUserSearch"
          :loading="isSearchingUsers"
          style="width: 100%"
        >
          <el-option
            v-for="item in userSearchResults"
            :key="item.id"
            :label="item.nickname || item.username"
            :value="item.id"
          >
            <div class="option-row">
              <span>{{ item.nickname || item.username }}</span>
              <span class="option-subtitle">{{ item.username }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="验证消息">
        <el-input v-model="addFriendForm.message" placeholder="请输入验证消息" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddFriend = false">取消</el-button>
      <el-button type="primary" @click="addFriend">发送请求</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showCreateGroup"
    title="创建群组"
    width="500px"
    append-to-body
  >
    <el-form :model="createGroupForm" label-width="80px">
      <el-form-item label="群组头像">
        <div class="create-group-avatar">
          <el-avatar :size="48" :src="createGroupForm.avatar" shape="square">
            {{ createGroupForm.name?.charAt(0) || "G" }}
          </el-avatar>
          <el-button size="small" @click="selectCreateGroupAvatar">选择头像</el-button>
          <input
            ref="createGroupAvatarInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleCreateGroupAvatarChange"
          />
        </div>
      </el-form-item>
      <el-form-item label="群组名称">
        <el-input v-model="createGroupForm.name" placeholder="请输入群组名称" />
      </el-form-item>
      <el-form-item label="群组描述">
        <el-input
          v-model="createGroupForm.description"
          placeholder="请输入群组描述"
        />
      </el-form-item>
      <el-form-item label="选择成员">
        <el-transfer
          v-model="createGroupForm.memberIds"
          :data="contactsForTransfer"
          :titles="['可选联系人', '群组成员']"
          filterable
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showCreateGroup = false">取消</el-button>
      <el-button type="primary" @click="createGroup">创建群组</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showGroupReadDialog"
    :title="`群消息已读成员（${groupReadUsers.length}）`"
    width="360px"
    append-to-body
  >
    <div v-if="groupReadUsers.length === 0" class="group-read-empty">
      暂无已读成员
    </div>
    <div v-else class="group-read-list">
      <div
        v-for="reader in groupReadUsers"
        :key="reader.userId"
        class="group-read-item"
      >
        <span class="group-read-name">{{ reader.displayName }}</span>
        <span class="group-read-id">ID: {{ reader.userId }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { useFileMessageUpload } from "@/features/chat/composables/useFileMessageUpload";
import type { GroupReadUser, User } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

const props = defineProps<{
  visibleAddFriend: boolean;
  visibleCreateGroup: boolean;
  visibleGroupReadDialog: boolean;
  groupReadUsers: GroupReadUser[];
}>();

const emit = defineEmits<{
  (e: "update:visibleAddFriend", value: boolean): void;
  (e: "update:visibleCreateGroup", value: boolean): void;
  (e: "update:visibleGroupReadDialog", value: boolean): void;
}>();

const chatStore = useChatStore();
const userStore = useUserStore();
const { capture, notifyInfo, notifySuccess } = useErrorHandler("chat-dialogs");
const { upload } = useFileMessageUpload();

const showAddFriend = computed({
  get: () => props.visibleAddFriend,
  set: (value: boolean) => emit("update:visibleAddFriend", value),
});

const showCreateGroup = computed({
  get: () => props.visibleCreateGroup,
  set: (value: boolean) => emit("update:visibleCreateGroup", value),
});

const showGroupReadDialog = computed({
  get: () => props.visibleGroupReadDialog,
  set: (value: boolean) => emit("update:visibleGroupReadDialog", value),
});

const isSearchingUsers = ref(false);
const userSearchResults = ref<User[]>([]);
const createGroupAvatarInputRef = ref<HTMLInputElement | null>(null);
const addFriendForm = reactive({
  targetUserId: "",
  message: "我想加您为好友",
});

const createGroupForm = reactive({
  name: "",
  description: "",
  avatar: "",
  memberIds: [] as string[],
});

const contactsForTransfer = computed(() => {
  return chatStore.friends.map((contact) => ({
    key: contact.friendId,
    label: contact.nickname || contact.username,
  }));
});

const handleUserSearch = async (query: string) => {
  if (!query.trim()) {
    userSearchResults.value = [];
    return;
  }
  isSearchingUsers.value = true;
  try {
    const users = await chatStore.searchUsers({ type: "username", keyword: query });
    userSearchResults.value = users.filter((user) => user.id !== userStore.userId);
  } catch (error) {
    capture(error, "搜索用户失败");
    userSearchResults.value = [];
  } finally {
    isSearchingUsers.value = false;
  }
};

const addFriend = async () => {
  if (!addFriendForm.targetUserId) {
    capture(new Error("请选择用户"), "请选择用户");
    return;
  }
  try {
    await chatStore.sendFriendRequest({
      userId: addFriendForm.targetUserId,
      message: addFriendForm.message,
    });
    notifySuccess("好友请求已发送");
    showAddFriend.value = false;
    addFriendForm.targetUserId = "";
    addFriendForm.message = "我想加您为好友";
    userSearchResults.value = [];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "添加好友失败";
    if (message.includes("已有待处理的好友申请")) {
      await chatStore.loadFriendRequests().catch(() => undefined);
      notifyInfo("已有待处理的好友申请，已同步到新的朋友");
      showAddFriend.value = false;
      return;
    }
    capture(error, "添加好友失败");
  }
};

const selectCreateGroupAvatar = () => {
  createGroupAvatarInputRef.value?.click();
};

const handleCreateGroupAvatarChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) {
    return;
  }
  try {
    const response = await upload(file, "IMAGE");
    createGroupForm.avatar = response.url;
  } catch {
    // message handled in uploader
  }
};

const createGroup = async () => {
  try {
    const name = createGroupForm.name.trim();
    if (!name) {
      capture(new Error("请输入群组名称"), "请输入群组名称");
      return;
    }
    await chatStore.createGroup({
      name,
      description: createGroupForm.description.trim(),
      avatar: createGroupForm.avatar,
      memberIds: createGroupForm.memberIds,
    });
    notifySuccess("群组创建成功");
    showCreateGroup.value = false;
    Object.assign(createGroupForm, {
      name: "",
      description: "",
      avatar: "",
      memberIds: [],
    });
  } catch (error) {
    capture(error, "创建群组失败");
  }
};
</script>

<style scoped lang="scss">
.option-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.option-subtitle {
  color: #8492a6;
  font-size: 13px;
  margin-left: 10px;
}

.create-group-avatar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-read-empty {
  color: #909399;
  text-align: center;
  padding: 12px 0;
}

.group-read-list {
  max-height: 320px;
  overflow-y: auto;
}

.group-read-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 2px;
  border-bottom: 1px solid #f0f2f5;
}

.group-read-name {
  color: #303133;
  font-size: 14px;
}

.group-read-id {
  color: #909399;
  font-size: 12px;
}
</style>
