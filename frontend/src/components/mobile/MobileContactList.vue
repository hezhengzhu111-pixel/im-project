<template>
  <div class="mcontact">
    <header class="mcontact-header">
      <span class="mcontact-header-title">{{ t("sidebar.contactsTitle") }}</span>
      <div class="mcontact-header-right">
        <button
          type="button"
          class="mcontact-icon-btn"
          :aria-label="t('sidebar.search')"
          @click="toggleSearch"
        >
          <el-icon :size="20"><Search /></el-icon>
        </button>
        <button
          type="button"
          class="mcontact-icon-btn"
          :aria-label="t('sidebar.addFriend')"
          @click="$emit('open-add-friend')"
        >
          <el-icon :size="20"><Plus /></el-icon>
        </button>
      </div>
    </header>

    <div v-show="searchOpen" class="mcontact-search">
      <el-input
        ref="searchInputRef"
        v-model="searchKeyword"
        clearable
        :prefix-icon="Search"
        :placeholder="t('sidebar.search')"
        :aria-label="t('sidebar.searchAria')"
      />
    </div>

    <div
      v-if="(pendingRequestsCount || 0) > 0"
      class="mcontact-request-alert"
      @click="$router.push('/contacts')"
    >
      <el-icon :size="16"><Bell /></el-icon>
      <span>{{ t("sidebar.pendingRequests", { count: pendingRequestsCount || 0 }) }}</span>
      <el-icon :size="14"><ArrowRight /></el-icon>
    </div>

    <div class="mcontact-list" role="list">
      <template v-if="loading && friends.length === 0">
        <div v-for="n in 6" :key="`sk-${n}`" class="mcontact-skeleton">
          <el-skeleton :rows="1" animated />
        </div>
      </template>

      <template v-else-if="groupedContacts.length > 0">
        <div
          v-for="group in groupedContacts"
          :key="group.key"
          class="mcontact-group"
        >
          <div class="mcontact-group-header">{{ group.key }}</div>
          <button
            v-for="contact in group.contacts"
            :key="contact.friendId"
            type="button"
            class="mcontact-item"
            @click="$emit('start-private-chat', contact)"
          >
            <el-avatar :size="40" :src="contact.avatar">
              {{
                contact.nickname?.charAt(0) ||
                contact.username?.charAt(0) ||
                "U"
              }}
            </el-avatar>
            <div class="mcontact-item-info">
              <div class="mcontact-item-name">
                {{ contact.remark || contact.nickname || contact.username || contact.friendId }}
              </div>
            </div>
          </button>
        </div>
      </template>

      <EmptyState v-else :title="t('sidebar.noContacts')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ArrowRight, Bell, Plus, Search } from "@element-plus/icons-vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useI18nStore } from "@/stores/i18n";
import type { Friend } from "@/types";

const props = defineProps<{
  friends: Friend[];
  loading?: boolean;
  pendingRequestsCount?: number;
}>();

defineEmits<{
  (e: "start-private-chat", contact: Friend): void;
  (e: "open-add-friend"): void;
}>();

const { t } = useI18nStore();

const searchOpen = ref(false);
const searchKeyword = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);
const resolvePinyinInitial = ref<((value: string) => string) | null>(null);

const toggleSearch = () => {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } else {
    searchKeyword.value = "";
  }
};

watch(
  () => props.friends.length,
  async (len) => {
    if (len > 0 && !resolvePinyinInitial.value) {
      const { pinyin } = await import("pinyin-pro");
      resolvePinyinInitial.value = (value: string) =>
        pinyin(value, {
          pattern: "first",
          toneType: "none",
        }).toUpperCase();
    }
  },
  { immediate: true },
);

const resolveContactInitial = (name: string) => {
  let initial = name.charAt(0).toUpperCase();
  if (/[一-龥]/.test(initial) && resolvePinyinInitial.value) {
    initial = resolvePinyinInitial.value(initial);
  }
  if (!/[A-Z]/.test(initial)) {
    initial = "#";
  }
  return initial;
};

const normalizedSearch = computed(() =>
  searchKeyword.value.trim().toLowerCase(),
);

const filteredContacts = computed(() => {
  if (!normalizedSearch.value) {
    return props.friends;
  }
  return props.friends.filter((contact) =>
    [
      contact.nickname,
      contact.username,
      contact.friendId,
      contact.remark,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch.value),
  );
});

const groupedContacts = computed(() => {
  const groups = new Map<string, Friend[]>();
  filteredContacts.value.forEach((contact) => {
    const displayName =
      contact.remark || contact.nickname || contact.username || contact.friendId || "";
    const firstChar = resolveContactInitial(displayName);
    groups.set(firstChar, [...(groups.get(firstChar) || []), contact]);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === "#") return 1;
      if (right === "#") return -1;
      return left.localeCompare(right);
    })
    .map(([key, contacts]) => ({ key, contacts }));
});
</script>

<style scoped lang="scss">
.mcontact {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.mcontact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  background: var(--chat-panel-bg, #fff);
}

.mcontact-header-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--chat-text-primary, #1e293b);
}

.mcontact-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mcontact-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:active {
    background: var(--surface-secondary, #f1f5f9);
  }
}

.mcontact-search {
  padding: 0 16px 8px;
  background: var(--chat-panel-bg, #fff);
}

.mcontact-request-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm, 8px);
  background: color-mix(in srgb, var(--color-primary, #6366f1) 8%, transparent);
  color: var(--color-primary, #6366f1);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:active {
    background: color-mix(in srgb, var(--color-primary, #6366f1) 14%, transparent);
  }

  span {
    flex: 1;
  }
}

.mcontact-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
  padding-bottom: calc(12px + var(--mobile-tabbar-height, 56px));
  -webkit-overflow-scrolling: touch;
}

.mcontact-group {
  margin-bottom: 12px;
}

.mcontact-group-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--chat-text-tertiary, #94a3b8);
  background: var(--chat-shell-bg, #f8fafc);
}

.mcontact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 8px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: var(--surface-elevated, #fff);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:active {
    background: var(--chat-card-hover, #f1f5f9);
  }
}

.mcontact-item-info {
  flex: 1;
  min-width: 0;
}

.mcontact-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--chat-text-primary, #1e293b);
}

.mcontact-skeleton {
  padding: 12px 8px;
  margin-bottom: 6px;
  border-radius: var(--radius-sm, 8px);
  background: var(--surface-elevated, #fff);
}
</style>
