<template>
  <div class="mcl">
    <!-- Header -->
    <header class="mcl-header">
      <div class="mcl-header-left">
        <el-avatar :size="32" :src="userAvatar">{{ userAvatarText }}</el-avatar>
        <span class="mcl-header-title">{{ t("sidebar.messagesTitle") }}</span>
      </div>
      <div class="mcl-header-right">
        <button
          type="button"
          class="mcl-icon-btn"
          :aria-label="t('sidebar.search')"
          @click="toggleSearch"
        >
          <el-icon :size="20"><Search /></el-icon>
        </button>
        <button
          type="button"
          class="mcl-icon-btn"
          :aria-label="t('sidebar.createGroup')"
          @click="$emit('open-create-group')"
        >
          <el-icon :size="20"><Plus /></el-icon>
        </button>
      </div>
    </header>

    <!-- Search -->
    <div v-show="searchOpen" class="mcl-search">
      <el-input
        ref="searchInputRef"
        v-model="searchKeyword"
        clearable
        :prefix-icon="Search"
        :placeholder="t('sidebar.search')"
        :aria-label="t('sidebar.searchAria')"
      />
    </div>

    <!-- Session list -->
    <div class="mcl-list" role="list">
      <template v-if="loading && filteredItems.length === 0">
        <SkeletonList :rows="6" />
      </template>

      <div
        v-for="item in filteredItems"
        :key="item.session.id"
        class="mcl-swipe-wrapper"
        @touchstart="onItemTouchStart($event, item.session.id)"
        @touchmove="onItemTouchMove($event, item.session.id)"
        @touchend="onItemTouchEnd($event, item.session.id)"
      >
        <div
          class="mcl-swipe-actions"
          :style="{ opacity: getSwipeOffset(item.session.id) < 0 ? 1 : 0 }"
        >
          <button
            type="button"
            class="mcl-swipe-action mcl-swipe-action--pin"
            @click.stop="$emit('select-session', item.session)"
          >
            {{ item.session.isPinned ? "取消置顶" : "置顶" }}
          </button>
          <button
            type="button"
            class="mcl-swipe-action mcl-swipe-action--delete"
            @click.stop="$emit('select-session', item.session)"
          >
            删除
          </button>
        </div>
        <button
          type="button"
          class="mcl-item"
          :class="{
            unread: item.session.unreadCount > 0,
            pinned: item.session.isPinned,
          }"
          :style="{ transform: `translateX(${getSwipeOffset(item.session.id)}px)` }"
          @click="$emit('select-session', item.session)"
        >
          <div class="mcl-avatar-wrap">
            <el-avatar :size="44" :src="item.session.targetAvatar">
              {{ item.session.targetName?.charAt(0) || "U" }}
            </el-avatar>
            <span
              v-if="item.session.type === 'private'"
              class="mcl-presence-dot"
              :class="{ online: item.online }"
            ></span>
          </div>

          <div class="mcl-body">
            <div class="mcl-row-top">
              <span class="mcl-name">{{ item.session.targetName }}</span>
              <span class="mcl-time">{{
                formatTime(item.session.lastActiveTime)
              }}</span>
            </div>
            <div class="mcl-row-mid">
              <span class="mcl-preview">{{ item.preview }}</span>
              <span class="mcl-flags">
                <span v-if="item.isAi" class="mcl-ai-tag">AI</span>
                <span
                  v-if="item.session.unreadCount > 0"
                  class="mcl-unread-badge"
                >
                  {{
                    item.session.unreadCount > 99
                      ? "99+"
                      : item.session.unreadCount
                  }}
                </span>
              </span>
            </div>
          </div>
        </button>
      </div>

      <EmptyState
        v-if="!loading && filteredItems.length === 0"
        :title="t('sidebar.noConversations')"
        :description="t('sidebar.noConversationsDesc')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { Plus, Search } from "@element-plus/icons-vue";
import EmptyState from "@/components/common/EmptyState.vue";
import SkeletonList from "@/components/common/SkeletonList.vue";
import { useI18nStore } from "@/stores/i18n";
import { useWebSocketStore } from "@/stores/websocket";
import { getAvatarText } from "@/utils/common";
import type { ChatSession } from "@/types";

const props = defineProps<{
  sessions: ChatSession[];
  loading?: boolean;
  userAvatar?: string;
  userName?: string;
}>();

defineEmits<{
  (e: "select-session", session: ChatSession): void;
  (e: "open-create-group"): void;
}>();

const { locale, t } = useI18nStore();
const webSocketStore = useWebSocketStore();

const searchOpen = ref(false);
const searchKeyword = ref("");
const debouncedKeyword = ref("");
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const searchInputRef = ref<{ focus: () => void } | null>(null);

const userAvatarText = computed(() => getAvatarText(props.userName || ""));

const toggleSearch = () => {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    nextTick(() => searchInputRef.value?.focus());
  } else {
    searchKeyword.value = "";
    debouncedKeyword.value = "";
  }
};

watch(searchKeyword, (val) => {
  if (searchTimer.value) clearTimeout(searchTimer.value);
  searchTimer.value = setTimeout(() => {
    debouncedKeyword.value = val.trim().toLowerCase();
    searchTimer.value = null;
  }, 150);
});

onUnmounted(() => {
  if (searchTimer.value) clearTimeout(searchTimer.value);
});

const formatTime = (time?: string) => {
  if (!time) return "";
  const date = new Date(time);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return t("sidebar.justNow");
  if (diff < 3_600_000)
    return t("sidebar.minutesAgo", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000)
    return t("sidebar.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  return date.toLocaleDateString(locale.value, {
    month: "numeric",
    day: "numeric",
  });
};

const previewMessage = (message?: ChatSession["lastMessage"]) => {
  if (!message) return "";
  switch (message.messageType) {
    case "IMAGE":
      return t("sidebar.image");
    case "FILE":
      return message.mediaName
        ? `${t("sidebar.file")} ${message.mediaName}`
        : t("sidebar.file");
    case "VOICE":
      return t("sidebar.voice");
    case "VIDEO":
      return t("sidebar.video");
    case "SYSTEM":
      return message.content || t("sidebar.system");
    default:
      return message.content || "";
  }
};

const sessionItems = computed(() =>
  props.sessions.map((session) => {
    const online =
      session.type === "private" &&
      webSocketStore.isUserOnline(String(session.targetId || ""));
    const preview =
      previewMessage(session.lastMessage) ||
      (session.type === "private"
        ? online
          ? t("sidebar.availableNow")
          : t("sidebar.noRecentMessages")
        : session.memberCount
          ? t("sidebar.members", { count: session.memberCount })
          : t("sidebar.noRecentMessages"));
    return {
      session,
      online,
      preview,
      isAi: Boolean(session.lastMessage?.isAiGenerated),
      searchText: [
        session.targetName,
        preview,
        session.conversationName,
        session.targetId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  }),
);

const filteredItems = computed(() => {
  if (!debouncedKeyword.value) return sessionItems.value;
  return sessionItems.value.filter((item) =>
    item.searchText.includes(debouncedKeyword.value),
  );
});

const swipeState = ref({ id: "", offsetX: 0, startX: 0 });

function onItemTouchStart(e: TouchEvent, sessionId: string) {
  swipeState.value = { id: sessionId, offsetX: 0, startX: e.touches[0].clientX };
}

function onItemTouchMove(e: TouchEvent, sessionId: string) {
  if (swipeState.value.id !== sessionId) return;
  const dx = e.touches[0].clientX - swipeState.value.startX;
  swipeState.value.offsetX = Math.min(0, Math.max(-120, dx));
}

function onItemTouchEnd(_e: TouchEvent, sessionId: string) {
  if (swipeState.value.id !== sessionId) return;
  // Snap to open (> -60px) or closed
  swipeState.value.offsetX = swipeState.value.offsetX < -60 ? -80 : 0;
}

function getSwipeOffset(sessionId: string) {
  return swipeState.value.id === sessionId ? swipeState.value.offsetX : 0;
}
</script>

<style scoped lang="scss">
.mcl {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--chat-shell-bg);
}

.mcl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  min-height: 56px;
  background: var(--chat-panel-bg);
  border-bottom: 1px solid var(--chat-panel-border);
  flex-shrink: 0;
}

.mcl-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mcl-header-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--chat-text-primary);
}

.mcl-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mcl-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;

  &:active {
    background: var(--surface-tertiary);
  }
}

.mcl-search {
  padding: 8px 16px;
  flex-shrink: 0;
}

.mcl-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 12px;
  padding-bottom: calc(
    12px + var(--mobile-tabbar-height, 56px) + env(safe-area-inset-bottom, 0px)
  );
}

.mcl-swipe-wrapper {
  position: relative;
  overflow: hidden;
  margin-bottom: 2px;
}

.mcl-swipe-actions {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  transition: opacity 0.2s ease;
}

.mcl-swipe-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  border: none;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.mcl-swipe-action--pin {
  background: var(--chat-accent, #2563eb);
}

.mcl-swipe-action--delete {
  background: var(--chat-danger, #ef4444);
}

.mcl-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 8px;
  border: none;
  background: var(--chat-panel-bg, #fff);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.12s ease,
    transform 0.2s ease;
  position: relative;
  z-index: 1;

  &:active {
    background: var(--surface-tertiary);
  }
}

.mcl-item.unread {
  background: color-mix(in srgb, var(--color-primary), transparent 95%);
}

.mcl-item.pinned {
  background: var(--surface-overlay);
}

.mcl-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.mcl-presence-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  border: 2px solid var(--chat-panel-bg, #fff);
  border-radius: 50%;
  background: #cbd5e1;
}

.mcl-presence-dot.online {
  background: var(--chat-success, #22c55e);
}

.mcl-body {
  flex: 1;
  min-width: 0;
}

.mcl-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mcl-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  color: var(--chat-text-primary);
}

.mcl-item.unread .mcl-name {
  font-weight: 700;
}

.mcl-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--chat-text-quaternary);
}

.mcl-row-mid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.mcl-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--chat-text-tertiary);
  line-height: 1.4;
}

.mcl-item.unread .mcl-preview {
  color: var(--text-secondary);
  font-weight: 500;
}

.mcl-flags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mcl-ai-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  height: 16px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--color-primary), transparent 90%);
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.mcl-unread-badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--chat-badge-bg);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 20px;
  text-align: center;
}
</style>
