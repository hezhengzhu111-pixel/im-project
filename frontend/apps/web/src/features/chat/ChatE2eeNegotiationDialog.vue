<template>
  <el-dialog
    v-model="visible"
    title="端到端加密请求"
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
          加密协商请求
        </template>
        <template #default>
          <p>
            <strong>{{ requesterName }}</strong> 请求与你开启端到端加密通信。
            接受后，双方消息将通过 Signal Protocol 进行端到端加密。
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
      <el-button :disabled="loading" @click="handleReject">
        拒绝
      </el-button>
      <el-button type="primary" :loading="loading" @click="handleAccept">
        {{ loading ? "协商中..." : "接受" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Lock } from "@element-plus/icons-vue";

interface Props {
  modelValue: boolean;
  requesterName: string;
  sessionId: string;
  requestPayloadJson?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "accepted"): void;
  (e: "rejected"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const loading = ref(false);
const error = ref("");

const handleReject = async () => {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const { keyService } = await import("@/features/e2ee/api/key-service");
    await keyService.rejectEncryption(props.sessionId);
    emit("rejected");
    visible.value = false;
  } catch (err) {
    console.error("[E2EE] Reject negotiation failed:", err);
    error.value = "拒绝操作失败，请重试。";
  } finally {
    loading.value = false;
  }
};

const handleAccept = async () => {
  loading.value = true;
  error.value = "";

  try {
    // Parse the handshake payload from Alice
    if (!props.requestPayloadJson) {
      throw new Error("协商载荷缺失，无法完成密钥交换。");
    }

    const payload = JSON.parse(props.requestPayloadJson) as {
      senderIdentityKey?: string;
      ephemeralPublicKey?: string;
      deviceId?: string;
    };

    if (!payload.senderIdentityKey || !payload.ephemeralPublicKey) {
      throw new Error("协商载荷格式错误，缺少必要的密钥信息。");
    }

    // Perform X3DH response and initialize receiving chain
    const { respondToNegotiation } = await import(
      "@/features/e2ee/manager/negotiation"
    );
    const ok = await respondToNegotiation(
      props.sessionId,
      payload.senderIdentityKey,
      payload.ephemeralPublicKey,
      payload.deviceId,
    );

    if (!ok) {
      throw new Error("密钥协商响应失败。");
    }

    // Notify server that we accepted
    const { keyService } = await import("@/features/e2ee/api/key-service");
    await keyService.acceptEncryption(props.sessionId);

    emit("accepted");
    visible.value = false;
  } catch (err) {
    console.error("[E2EE] Accept negotiation failed:", err);
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
