<template>
  <el-dialog
    v-model="showAddFriend"
    :title="t('dialog.addFriend')"
    width="420px"
    append-to-body
    class="chat-shell-dialog"
  >
    <el-form :model="addFriendForm" label-width="84px">
      <el-form-item :label="t('dialog.user')">
        <el-select
          v-model="addFriendForm.targetUserId"
          filterable
          remote
          reserve-keyword
          :placeholder="t('dialog.searchByUsername')"
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
      <el-form-item :label="t('dialog.message')">
        <el-input v-model="addFriendForm.message" :placeholder="t('dialog.sayHello')" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddFriend = false">{{ t("common.cancel") }}</el-button>
      <el-button type="primary" @click="addFriend">{{ t("dialog.sendRequest") }}</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showCreateGroup"
    :title="t('dialog.createGroup')"
    width="520px"
    append-to-body
    class="chat-shell-dialog"
  >
    <el-form :model="createGroupForm" label-width="84px">
      <el-form-item :label="t('dialog.avatar')">
        <div class="create-group-avatar">
          <el-avatar :size="52" :src="createGroupForm.avatar">
            {{ createGroupForm.name?.charAt(0) || "G" }}
          </el-avatar>
          <el-button size="small" @click="selectCreateGroupAvatar">
            {{ t("dialog.choose") }}
          </el-button>
          <input
            ref="createGroupAvatarInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleCreateGroupAvatarChange"
          />
        </div>
      </el-form-item>
      <el-form-item :label="t('dialog.name')">
        <el-input v-model="createGroupForm.name" :placeholder="t('dialog.groupName')" />
      </el-form-item>
      <el-form-item :label="t('dialog.desc')">
        <el-input
          v-model="createGroupForm.description"
          :placeholder="t('dialog.groupDescription')"
        />
      </el-form-item>
      <el-form-item :label="t('dialog.members')">
        <el-transfer
          v-model="createGroupForm.memberIds"
          :data="contactsForTransfer"
          :titles="transferTitles"
          filterable
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showCreateGroup = false">{{ t("common.cancel") }}</el-button>
      <el-button type="primary" @click="createGroup">{{ t("dialog.create") }}</el-button>
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
    :title="currentSession?.type === 'group' ? t('chat.groupInfo') : t('chat.contactInfo')"
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
                ? t("dialog.groupConversation")
                : privateSessionOnline
                  ? t("chat.onlineNow")
                  : t("chat.offline")
            }}
          </div>
        </div>
      </div>

      <el-descriptions :column="1" border class="session-info-card">
        <el-descriptions-item :label="t('dialog.conversationId')">
          {{ currentSession.id }}
        </el-descriptions-item>
        <template v-if="currentSession.type === 'private'">
          <el-descriptions-item :label="t('dialog.userId')">
            {{ currentSession.targetId }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('dialog.username')">
            {{ sessionInfoFriend?.username || "-" }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('dialog.remark')">
            {{ sessionInfoFriend?.remark || "-" }}
          </el-descriptions-item>
        </template>
        <template v-else>
          <el-descriptions-item :label="t('dialog.groupId')">
            {{ currentSession.targetId }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('dialog.members')">
            {{ sessionInfoMemberCount }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('dialog.description')">
            {{ sessionInfoGroup?.description || sessionInfoGroup?.announcement || "-" }}
          </el-descriptions-item>
        </template>
      </el-descriptions>

      <template v-if="currentSession.type === 'group'">
        <div class="member-section-title">{{ t("dialog.members") }}</div>
        <div v-if="sessionInfoLoading" class="member-state">
          {{ t("dialog.loadingMembers") }}
        </div>
        <div v-else-if="sessionInfoError" class="member-state member-error">
          {{ sessionInfoError }}
        </div>
        <el-empty
          v-else-if="sessionInfoMembers.length === 0"
          :description="t('dialog.noMemberDetails')"
          :image-size="60"
        />
        <div v-else class="member-list chat-soft-scrollbar">
          <div
            v-for="member in sessionInfoMembers"
            :key="member.id || member.userId"
            class="member-item"
          >
            <div class="member-avatar-wrap">
              <el-avatar :size="34" :src="member.avatar">
                {{ (member.nickname || member.username || member.userId).charAt(0) }}
              </el-avatar>
              <span class="member-online-dot" :class="{ online: member.online }"></span>
            </div>
            <div class="member-meta">
              <div class="member-name-row">
                <span class="member-name">
                  {{ member.nickname || member.username || member.userId }}
                </span>
                <span class="member-status" :class="{ online: member.online }">
                  {{ member.online ? t("chat.onlineNow") : t("chat.offline") }}
                </span>
              </div>
              <div class="member-subtitle">
                {{ member.role }} · {{ t("dialog.joined") }}
                {{ formatMessageTime(member.joinTime) }}
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
import {useFileMessageUpload} from "@/features/chat/composables/useFileMessageUpload";
import {useErrorHandler} from "@/hooks/useErrorHandler";
import {useChatStore} from "@/stores/chat";
import {useI18nStore} from "@/stores/i18n";
import {useUserStore} from "@/stores/user";
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
const {locale, t} = useI18nStore();
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
const sessionInfoMemberCount = computed(() =>
  sessionInfoMembers.value.length ||
  sessionInfoGroup.value?.memberCount ||
  currentSession.value?.memberCount ||
  0,
);

const isSearchingUsers = ref(false);
const userSearchResults = ref<User[]>([]);
const createGroupAvatarInputRef = ref<HTMLInputElement | null>(null);
const addFriendForm = reactive({
  targetUserId: "",
  message: t("dialog.sayHello"),
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
const transferTitles = computed(() => [t("dialog.available"), t("dialog.selected")]);

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
    capture(error, t("dialog.failedSearchUsers"));
    userSearchResults.value = [];
  } finally {
    isSearchingUsers.value = false;
  }
};

const addFriend = async () => {
  if (!addFriendForm.targetUserId) {
    capture(new Error(t("dialog.pleaseSelectUser")), t("dialog.pleaseSelectUser"));
    return;
  }
  try {
    await chatStore.sendFriendRequest({
      userId: addFriendForm.targetUserId,
      message: addFriendForm.message,
    });
    notifySuccess(t("dialog.friendRequestSent"));
    showAddFriend.value = false;
    addFriendForm.targetUserId = "";
    addFriendForm.message = t("dialog.sayHello");
    userSearchResults.value = [];
  } catch (error) {
    const message = error instanceof Error ? error.message : t("dialog.failedAddFriend");
    if (message.includes("pending")) {
      await chatStore.loadFriendRequests().catch(() => undefined);
      notifyInfo(t("dialog.friendRequestPending"));
      showAddFriend.value = false;
      return;
    }
    capture(error, t("dialog.failedAddFriend"));
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
    // The uploader already surfaced the error.
  }
};

const createGroup = async () => {
  try {
    const name = createGroupForm.name.trim();
    if (!name) {
      capture(new Error(t("dialog.pleaseEnterGroupName")), t("dialog.pleaseEnterGroupName"));
      return;
    }
    await chatStore.createGroup({
      name,
      description: createGroupForm.description.trim(),
      avatar: createGroupForm.avatar,
      memberIds: createGroupForm.memberIds,
    });
    notifySuccess(t("dialog.groupCreated"));
    showCreateGroup.value = false;
    Object.assign(createGroupForm, {
      name: "",
      description: "",
      avatar: "",
      memberIds: [],
    });
  } catch (error) {
    capture(error, t("dialog.failedCreateGroup"));
  }
};

const formatMessageTime = (value?: string) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(locale.value);
};
</script>

<style scoped lang="scss">
.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.72);
}

.member-item + .member-item {
  margin-top: 8px;
}

.member-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.member-online-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #cbd5e1;
}

.member-online-dot.online {
  background: var(--chat-success);
}

.session-info-name,
.member-name {
  color: var(--chat-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.member-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.member-status {
  flex-shrink: 0;
  color: var(--chat-text-tertiary);
  font-size: 11px;
  font-weight: 700;
}

.member-status.online {
  color: var(--chat-success);
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
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: var(--chat-panel-bg);
  backdrop-filter: var(--chat-glass-blur);
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
  border-radius: 8px;
  border: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  box-shadow: var(--chat-surface-shadow);
  backdrop-filter: var(--chat-glass-blur);
}

:deep(.chat-shell-dialog .el-dialog__header),
:deep(.chat-shell-drawer .el-drawer__header) {
  margin-right: 0;
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--chat-panel-border);
}

:deep(.chat-shell-dialog .el-dialog__body) {
  padding: 18px 20px 20px;
}

:deep(.chat-shell-dialog .el-dialog__footer) {
  padding: 0 20px 18px;
}

:deep(.chat-shell-drawer .el-drawer__body) {
  padding: 18px 20px 20px;
}
</style>
