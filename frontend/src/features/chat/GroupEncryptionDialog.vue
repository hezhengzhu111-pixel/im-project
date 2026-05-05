<template>
  <el-dialog
    v-model="visible"
    title="开启群聊端到端加密"
    width="480px"
    append-to-body
    class="chat-shell-dialog"
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
  >
    <div class="group-encryption-body">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="group-encryption-alert"
      >
        <template #title>
          群聊加密说明
        </template>
        <template #default>
          <p>
            开启后，群内所有消息将使用 Sender Key 机制加密。
            系统会为每个成员的每台设备单独加密分发密钥。
          </p>
        </template>
      </el-alert>

      <div class="member-device-summary">
        <div class="summary-title">
          将为以下成员分发加密密钥：
        </div>
        <div class="member-list chat-soft-scrollbar">
          <div
            v-for="member in members"
            :key="member.userId"
            class="member-row"
          >
            <span class="member-id">{{ member.userId }}</span>
            <span class="device-count">
              {{ member.devices.length }} 台设备
            </span>
          </div>
        </div>
        <div class="total-count">
          共 {{ totalDeviceCount }} 台设备需要密钥分发
        </div>
      </div>

      <el-alert
        v-if="error"
        type="error"
        :closable="true"
        show-icon
        class="group-encryption-error"
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
        {{ loading ? `分发中 (${progress}/${totalDeviceCount})...` : "确认开启" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

interface DeviceInfo {
  deviceId: string;
  identityKey: string;
}

interface MemberEntry {
  userId: string;
  devices: DeviceInfo[];
}

interface Props {
  modelValue: boolean;
  groupId: string;
  members: MemberEntry[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "enabled"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const loading = ref(false);
const error = ref("");
const progress = ref(0);

const totalDeviceCount = computed(() =>
  props.members.reduce((sum, m) => sum + m.devices.length, 0),
);

const handleCancel = () => {
  if (loading.value) return;
  visible.value = false;
};

const handleConfirm = async () => {
  loading.value = true;
  error.value = "";
  progress.value = 0;

  try {
    const [
      { generateSenderKey, serializeSenderKey },
      { importPublicKey, ecdhDeriveBits, hkdfDeriveKey, aesGcmEncrypt },
      { base64ToBuffer, bufferToBase64, randomBytes },
      { e2eeGroupService },
    ] = await Promise.all([
      import("@/features/e2ee/engine/sender-key"),
      import("@/features/e2ee/engine/crypto-primitives"),
      import("@/features/e2ee/engine/codec"),
      import("@/features/e2ee/api/group-service"),
    ]);

    // 1. Generate Sender Key
    const senderKey = await generateSenderKey();
    const serialized = await serializeSenderKey(senderKey);

    // Serialize sender key to JSON string for encryption
    const senderKeyJson = JSON.stringify(serialized);

    // 2. Encrypt sender key for each member's each device
    const encryptedKeys: {
      recipientId: string;
      deviceId: string;
      encryptedSenderKey: string;
    }[] = [];

    for (const member of props.members) {
      for (const device of member.devices) {
        try {
          // Import device's identity public key
          const remotePubKey = await importPublicKey(
            base64ToBuffer(device.identityKey),
          );

          // Generate ephemeral ECDH key pair for this encryption
          const ephemeralKeyPair = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            false,
            ["deriveBits"],
          );

          // ECDH shared secret
          const sharedSecret = await ecdhDeriveBits(
            ephemeralKeyPair.privateKey,
            remotePubKey,
          );

          // Derive AES-GCM key from shared secret via HKDF
          const salt = randomBytes(32).buffer as ArrayBuffer;
          const info = new TextEncoder().encode(
            `e2ee-sender-key:${props.groupId}`,
          ).buffer as ArrayBuffer;
          const aesKey = await hkdfDeriveKey(sharedSecret, salt, info);

          // Encrypt sender key JSON
          const plaintext = new TextEncoder().encode(senderKeyJson)
            .buffer as ArrayBuffer;
          const { ciphertext, iv } = await aesGcmEncrypt(aesKey, plaintext);

          // Export ephemeral public key to include in payload
          const ephemeralPubRaw = await crypto.subtle.exportKey(
            "raw",
            ephemeralKeyPair.publicKey,
          );

          // Bundle: ephemeralPub || salt || iv || ciphertext
          const ephemeralPubBytes = new Uint8Array(ephemeralPubRaw);
          const saltBytes = new Uint8Array(salt);
          const ivBytes = iv;
          const ciphertextBytes = new Uint8Array(ciphertext);

          const bundle = new Uint8Array(
            2 + ephemeralPubBytes.length +
            2 + saltBytes.length +
            2 + ivBytes.length +
            ciphertextBytes.length,
          );
          let offset = 0;

          // Write ephemeral pub (length-prefixed with 2 bytes)
          bundle.set([ephemeralPubBytes.length >> 8, ephemeralPubBytes.length & 0xff], offset);
          offset += 2;
          bundle.set(ephemeralPubBytes, offset);
          offset += ephemeralPubBytes.length;

          // Write salt
          bundle.set([saltBytes.length >> 8, saltBytes.length & 0xff], offset);
          offset += 2;
          bundle.set(saltBytes, offset);
          offset += saltBytes.length;

          // Write iv
          bundle.set([ivBytes.length >> 8, ivBytes.length & 0xff], offset);
          offset += 2;
          bundle.set(ivBytes, offset);
          offset += ivBytes.length;

          // Write ciphertext
          bundle.set(ciphertextBytes, offset);

          encryptedKeys.push({
            recipientId: member.userId,
            deviceId: device.deviceId,
            encryptedSenderKey: bufferToBase64(bundle.buffer as ArrayBuffer),
          });

          progress.value++;
        } catch (deviceErr) {
          console.error(
            `[E2EE] Failed to encrypt sender key for user=${member.userId} device=${device.deviceId}:`,
            deviceErr,
          );
          throw new Error(
            `无法为用户 ${member.userId} 的设备 ${device.deviceId} 加密密钥。请确认该用户已注册 E2EE 密钥。`,
          );
        }
      }
    }

    // 3. Call API to enable group encryption
    await e2eeGroupService.enableGroupEncryption(props.groupId, encryptedKeys);

    emit("enabled");
    visible.value = false;
  } catch (err) {
    console.error("[E2EE] Group encryption enable failed:", err);
    error.value =
      err instanceof Error
        ? err.message
        : "群聊加密启用过程中发生未知错误，请重试。";
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped lang="scss">
.group-encryption-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-encryption-alert {
  :deep(.el-alert__description) {
    p {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--chat-text-secondary);
    }
  }
}

.member-device-summary {
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.72);
  overflow: hidden;
}

.summary-title {
  padding: 12px 14px 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--chat-text-primary);
}

.member-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0 14px;
}

.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid var(--border-light);

  &:first-child {
    border-top: 0;
  }
}

.member-id {
  font-size: 13px;
  color: var(--chat-text-primary);
  font-weight: 500;
}

.device-count {
  font-size: 12px;
  color: var(--chat-text-tertiary);
}

.total-count {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  color: var(--chat-text-secondary);
  border-top: 1px solid var(--chat-panel-border);
  text-align: right;
}

.group-encryption-error {
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
