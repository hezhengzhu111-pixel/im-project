<template>
  <el-dialog
    v-model="showAddFriend"
    title="Add friend"
    width="420px"
    append-to-body
    class="chat-shell-dialog"
  >
    <el-form :model="addFriendForm" label-width="80px">
      <el-form-item label="User">
        <el-select
          v-model="addFriendForm.targetUserId"
          filterable
          remote
          reserve-keyword
          placeholder="Search by username"
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
      <el-form-item label="Message">
        <el-input v-model="addFriendForm.message" placeholder="Say hello" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddFriend = false">Cancel</el-button>
      <el-button type="primary" @click="addFriend">Send request</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showCreateGroup"
    title="Create group"
    width="520px"
    append-to-body
    class="chat-shell-dialog"
  >
    <el-form :model="createGroupForm" label-width="84px">
      <el-form-item label="Avatar">
        <div class="create-group-avatar">
          <el-avatar :size="52" :src="createGroupForm.avatar">
            {{ createGroupForm.name?.charAt(0) || "G" }}
          </el-avatar>
          <el-button size="small" @click="selectCreateGroupAvatar">Choose</el-button>
          <input
            ref="createGroupAvatarInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleCreateGroupAvatarChange"
          />
        </div>
      </el-form-item>
      <el-form-item label="Name">
        <el-input v-model="createGroupForm.name" placeholder="Group name" />
      </el-form-item>
      <el-form-item label="Desc">
        <el-input v-model="createGroupForm.description" placeholder="Group description" />
      </el-form-item>
      <el-form-item label="Members">
        <el-transfer
          v-model="createGroupForm.memberIds"
          :data="contactsForTransfer"
          :titles="['Available', 'Selected']"
          filterable
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showCreateGroup = false">Cancel</el-button>
      <el-button type="primary" @click="createGroup">Create</el-button>
    </template>
  </el-dialog>

  <AsyncChatGroupReadDialog
    v-if="showGroupReadDialog"
    v-model="showGroupReadDialog"
    :group-read-users="groupReadUsers"
  />

  <AsyncChatSearchDialog
    v-if="showSearchDialog"
    v-model="showSearchDialog"
    :session-id="currentSession?.id"
    :search-results="searchResults"
  />

  <el-drawer
    v-model="showSessionInfoDrawer"
    :title="currentSession?.type === 'group' ? 'Group info' : 'Contact info'"
    size="380px"
    append-to-body
    class="chat-shell-drawer"
  >
    <template v-if="currentSession">
      <div class="session-info-header">
        <el-avatar :size="64" :src="sessionInfoAvatar">
          {{ sessionInfoDisplayName.charAt(0) || "C" }}
        </el-avatar>
        <div class="session-info-heading">
          <div class="session-info-name">{{ sessionInfoDisplayName }}</div>
          <div class="session-info-subtitle">
            {{
              currentSession.type === "group"
                ? "Group conversation"
                : privateSessionOnline
                  ? "Online now"
                  : "Offline"
            }}
          </div>
        </div>
      </div>

      <el-descriptions :column="1" border class="session-info-card">
        <el-descriptions-item label="Conversation ID">
          {{ currentSession.id }}
        </el-descriptions-item>
        <template v-if="currentSession.type === 'private'">
          <el-descriptions-item label="User ID">
            {{ currentSession.targetId }}
          </el-descriptions-item>
          <el-descriptions-item label="Username">
            {{ sessionInfoFriend?.username || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="Remark">
            {{ sessionInfoFriend?.remark || "-" }}
          </el-descriptions-item>
        </template>
        <template v-else>
          <el-descriptions-item label="Group ID">
            {{ currentSession.targetId }}
          </el-descriptions-item>
          <el-descriptions-item label="Members">
            {{ sessionInfoGroup?.memberCount || currentSession.memberCount || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="Description">
            {{ sessionInfoGroup?.description || sessionInfoGroup?.announcement || "-" }}
          </el-descriptions-item>
        </template>
      </el-descriptions>

      <template v-if="currentSession.type === 'group'">
        <div class="member-section-title">Members</div>
        <div v-if="sessionInfoLoading" class="member-state">Loading members...</div>
        <div v-else-if="sessionInfoError" class="member-state member-error">
          {{ sessionInfoError }}
        </div>
        <el-empty
          v-else-if="sessionInfoMembers.length === 0"
          description="No member details available."
          :image-size="60"
        />
        <div v-else class="member-list chat-soft-scrollbar">
          <div
            v-for="member in sessionInfoMembers"
            :key="member.id || member.userId"
            class="member-item"
          >
            <el-avatar :size="34" :src="member.avatar">
              {{ (member.nickname || member.username || member.userId).charAt(0) }}
            </el-avatar>
            <div class="member-meta">
              <div class="member-name">{{ member.nickname || member.username || member.userId }}</div>
              <div class="member-subtitle">
                {{ member.role }} · Joined {{ formatMessageTime(member.joinTime) }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, reactive, ref} from "vue";
import {useChatStore} from "@/stores/chat";
import {useUserStore} from "@/stores/user";
import {useFileMessageUpload} from "@/features/chat/composables/useFileMessageUpload";
import {useErrorHandler} from "@/hooks/useErrorHandler";
import type {ChatSession, Friend, Group, GroupMember, GroupReadUser, MessageSearchResult, User,} from "@/types";

const AsyncChatSearchDialog = defineAsyncComponent(
  () => import("@/features/chat/dialogs/ChatSearchDialog.vue"),
);
const AsyncChatGroupReadDialog = defineAsyncComponent(
  () => import("@/features/chat/dialogs/ChatGroupReadDialog.vue"),
);

const props = defineProps<{
  visibleAddFriend: boolean;
  visibleCreateGroup: boolean;
  visibleGroupReadDialog: boolean;
  visibleSearchDialog: boolean;
  visibleSessionInfoDrawer: boolean;
  currentSession?: ChatSession | null;
  groupReadUsers: GroupReadUser[];
  searchResults: MessageSearchResult[];
  sessionInfoFriend?: Friend | null;
  sessionInfoGroup?: Group | null;
  sessionInfoMembers: GroupMember[];
  sessionInfoLoading: boolean;
  sessionInfoError: string;
  privateSessionOnline: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visibleAddFriend", value: boolean): void;
  (e: "update:visibleCreateGroup", value: boolean): void;
  (e: "update:visibleGroupReadDialog", value: boolean): void;
  (e: "update:visibleSearchDialog", value: boolean): void;
  (e: "update:visibleSessionInfoDrawer", value: boolean): void;
}>();

const chatStore = useChatStore();
const userStore = useUserStore();
const {capture, notifyInfo, notifySuccess} = useErrorHandler("chat-dialogs");
const {upload} = useFileMessageUpload();

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
const showSearchDialog = computed({
  get: () => props.visibleSearchDialog,
  set: (value: boolean) => emit("update:visibleSearchDialog", value),
});
const showSessionInfoDrawer = computed({
  get: () => props.visibleSessionInfoDrawer,
  set: (value: boolean) => emit("update:visibleSessionInfoDrawer", value),
});

const currentSession = computed(() => props.currentSession || null);
const groupReadUsers = computed(() => props.groupReadUsers);
const searchResults = computed(() => props.searchResults);
const sessionInfoFriend = computed(() => props.sessionInfoFriend || null);
const sessionInfoGroup = computed(() => props.sessionInfoGroup || null);
const sessionInfoMembers = computed(() => props.sessionInfoMembers);
const sessionInfoLoading = computed(() => props.sessionInfoLoading);
const sessionInfoError = computed(() => props.sessionInfoError);
const privateSessionOnline = computed(() => props.privateSessionOnline);

const isSearchingUsers = ref(false);
const userSearchResults = ref<User[]>([]);
const createGroupAvatarInputRef = ref<HTMLInputElement | null>(null);
const addFriendForm = reactive({
  targetUserId: "",
  message: "Hi, let's connect.",
});
const createGroupForm = reactive({
  name: "",
  description: "",
  avatar: "",
  memberIds: [] as string[],
});

const contactsForTransfer = computed(() =>
  chatStore.friends.map((contact) => ({
    key: contact.friendId,
    label: contact.nickname || contact.username,
  })),
);

const sessionInfoDisplayName = computed(() => {
  if (currentSession.value?.type === "group") {
    return (
      sessionInfoGroup.value?.groupName ||
      sessionInfoGroup.value?.name ||
      currentSession.value?.targetName ||
      ""
    );
  }
  return (
    sessionInfoFriend.value?.remark ||
    sessionInfoFriend.value?.nickname ||
    sessionInfoFriend.value?.username ||
    currentSession.value?.targetName ||
    ""
  );
});

const sessionInfoAvatar = computed(() =>
  currentSession.value?.type === "group"
    ? sessionInfoGroup.value?.avatar || currentSession.value?.targetAvatar
    : sessionInfoFriend.value?.avatar || currentSession.value?.targetAvatar,
);

const handleUserSearch = async (query: string) => {
  if (!query.trim()) {
    userSearchResults.value = [];
    return;
  }
  isSearchingUsers.value = true;
  try {
    const users = await chatStore.searchUsers({type: "username", keyword: query});
    userSearchResults.value = users.filter((user) => user.id !== userStore.userId);
  } catch (error) {
    capture(error, "Failed to search users");
    userSearchResults.value = [];
  } finally {
    isSearchingUsers.value = false;
  }
};

const addFriend = async () => {
  if (!addFriendForm.targetUserId) {
    capture(new Error("Please select a user"), "Please select a user");
    return;
  }
  try {
    await chatStore.sendFriendRequest({
      userId: addFriendForm.targetUserId,
      message: addFriendForm.message,
    });
    notifySuccess("Friend request sent.");
    showAddFriend.value = false;
    addFriendForm.targetUserId = "";
    addFriendForm.message = "Hi, let's connect.";
    userSearchResults.value = [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add friend";
    if (message.includes("pending")) {
      await chatStore.loadFriendRequests().catch(() => undefined);
      notifyInfo("A pending request already exists. Refreshed requests list.");
      showAddFriend.value = false;
      return;
    }
    capture(error, "Failed to add friend");
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
    // uploader already surfaced the error
  }
};

const createGroup = async () => {
  try {
    const name = createGroupForm.name.trim();
    if (!name) {
      capture(new Error("Please enter a group name"), "Please enter a group name");
      return;
    }
    await chatStore.createGroup({
      name,
      description: createGroupForm.description.trim(),
      avatar: createGroupForm.avatar,
      memberIds: createGroupForm.memberIds,
    });
    notifySuccess("Group created.");
    showCreateGroup.value = false;
    Object.assign(createGroupForm, {
      name: "",
      description: "",
      avatar: "",
      memberIds: [],
    });
  } catch (error) {
    capture(error, "Failed to create group");
  }
};

const formatMessageTime = (value?: string) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};
</script>

<style scoped lang="scss">
.option-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.option-subtitle {
  margin-left: 10px;
  color: var(--chat-text-tertiary);
  font-size: 13px;
}

.create-group-avatar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-state {
  padding: 14px 0;
  color: var(--chat-text-tertiary);
  text-align: center;
}

.member-error {
  color: var(--chat-danger);
}

.member-list {
  max-height: 340px;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(226, 232, 240, 0.82);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);
}

.member-item + .member-item {
  margin-top: 10px;
}

.session-info-name,
.member-name {
  color: var(--chat-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.session-info-subtitle,
.member-subtitle {
  color: var(--chat-text-tertiary);
  font-size: 12px;
}

.session-info-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding: 18px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.94), rgba(248, 250, 252, 0.94));
}

.session-info-card {
  margin-bottom: 18px;
}

.member-section-title {
  margin-bottom: 10px;
  color: var(--chat-text-primary);
  font-size: 13px;
  font-weight: 800;
}

.member-meta {
  flex: 1;
}

:deep(.chat-shell-dialog .el-dialog),
:deep(.chat-shell-drawer .el-drawer) {
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 28px 64px rgba(15, 23, 42, 0.16);
}

:deep(.chat-shell-dialog .el-dialog__header),
:deep(.chat-shell-drawer .el-drawer__header) {
  margin-right: 0;
  padding: 20px 22px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

:deep(.chat-shell-dialog .el-dialog__body) {
  padding: 18px 22px 22px;
}

:deep(.chat-shell-dialog .el-dialog__footer) {
  padding: 0 22px 20px;
}

:deep(.chat-shell-drawer .el-drawer__body) {
  padding: 18px 20px 20px;
}
</style>
