<template>
  <el-dialog
    v-model="visible"
    title="开启端到端加密"
    width="420px"
    append-to-body
    class="chat-shell-dialog"
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
  >
    <div class="encryption-dialog-body">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="encryption-info-alert"
      >
        <template #title>
          端到端加密说明
        </template>
        <template #default>
          <p>
            开启后，你与 <strong>{{ peerName }}</strong> 的所有消息将通过
            Signal Protocol 进行端到端加密。加密过程中需要双方在线完成密钥协商。
          </p>
        </template>
      </el-alert>

      <div class="encryption-features">
        <div class="feature-item">
          <el-icon class="feature-icon"><Lock /></el-icon>
          <span>消息内容只有你和对方可以看到</span>
        </div>
        <div class="feature-item">
          <el-icon class="feature-icon"><Lock /></el-icon>
          <span>服务器无法读取加密消息</span>
        </div>
        <div class="feature-item">
          <el-icon class="feature-icon"><Lock /></el-icon>
          <span>支持前向保密（Double Ratchet）</span>
        </div>
      </div>

      <el-alert
        v-if="error"
        type="error"
        :closable="true"
        show-icon
        class="encryption-error-alert"
        @close="error = ''"
      >
        {{ error }}
      </el-alert>
    </div>

    <template #footer>
      <el-button :disabled="loading" @click="handleCancel">
        取消
      </el-button>
      <el-button type="primary" :loading="loading" @click="handleConfirm">
        {{ loading ? "协商中..." : "确认开启" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Lock } from "@element-plus/icons-vue";

interface Props {
  modelValue: boolean;
  peerName: string;
  peerId: string;
  sessionId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "encrypted"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const loading = ref(false);
const error = ref("");

const handleCancel = () => {
  if (loading.value) return;
  visible.value = false;
};

const handleConfirm = async () => {
  loading.value = true;
  error.value = "";

  try {
    const { initiateNegotiation } = await import(
      "@/features/e2ee/manager/negotiation"
    );
    const success = await initiateNegotiation(
      props.sessionId,
      props.peerId,
    );

    if (success) {
      emit("encrypted");
      visible.value = false;
    } else {
      error.value =
        "密钥协商失败。请确认对方已注册 E2EE 密钥且当前在线，然后重试。";
    }
  } catch (err) {
    console.error("[E2EE] Negotiation dialog error:", err);
    error.value =
      err instanceof Error
        ? `协商出错: ${err.message}`
        : "密钥协商过程中发生未知错误，请重试。";
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped lang="scss">
.encryption-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.encryption-info-alert {
  :deep(.el-alert__description) {
    p {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--chat-text-secondary);

      strong {
        color: var(--chat-text-primary);
      }
    }
  }
}

.encryption-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.72);
  border: 1px solid var(--chat-panel-border);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--chat-text-secondary);

  .feature-icon {
    color: var(--color-primary, #6366f1);
    font-size: 14px;
    flex-shrink: 0;
  }
}

.encryption-error-alert {
  margin-top: 4px;
}

:deep(.chat-shell-dialog .el-dialog) {
  border-radius: 8px;
  border: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  box-shadow: var(--chat-surface-shadow);
  backdrop-filter: var(--chat-glass-blur);
}

:deep(.chat-shell-dialog .el-dialog__header) {
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
</style>
