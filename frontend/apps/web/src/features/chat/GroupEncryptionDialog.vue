<template>
  <el-dialog v-model="visible" title="Group encryption unavailable" width="420px">
    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="Group E2EE requires Rust sender-key support before it can be enabled."
    />
    <template #footer>
      <el-button @click="visible = false">Close</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: boolean;
  groupId: number;
  members: Array<{
    userId: string;
    username: string;
    devices: Array<{
      deviceId: string;
      identityKey: string;
    }>;
  }>;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "enabled"): void;
}>();

void props.groupId;
void props.members;
void emit;

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});
</script>
