<template>
  <el-dialog
    v-model="visible"
    :title="t('message.readBy', { count: groupReadUsers.length })"
    width="380px"
    append-to-body
    class="chat-shell-dialog"
  >
    <div v-if="groupReadUsers.length === 0" class="group-read-empty">
      {{ t("dialog.noReaders") }}
    </div>
    <div v-else class="group-read-list chat-soft-scrollbar">
      <div v-for="reader in groupReadUsers" :key="reader.userId" class="group-read-item">
        <span class="group-read-name">{{ reader.displayName }}</span>
        <span class="group-read-id">ID: {{ reader.userId }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {useI18nStore} from "@/stores/i18n";
import type {GroupReadUser} from "@/types";

const props = defineProps<{
  modelValue: boolean;
  groupReadUsers: GroupReadUser[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const {t} = useI18nStore();
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const groupReadUsers = computed(() => props.groupReadUsers);
</script>

<style scoped lang="scss">
.group-read-empty {
  padding: 14px 0;
  color: var(--chat-text-tertiary);
  text-align: center;
}

.group-read-list {
  max-height: 340px;
  overflow-y: auto;
}

.group-read-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.72);
}

.group-read-item + .group-read-item {
  margin-top: 10px;
}

.group-read-name {
  color: var(--chat-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.group-read-id {
  color: var(--chat-text-tertiary);
  font-size: 12px;
}
</style>
