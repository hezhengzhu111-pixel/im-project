<template>
  <div class="ai-settings-page">
    <div class="ai-settings-shell">
      <header class="settings-hero">
        <div class="hero-actions">
          <button
            type="button"
            class="icon-button"
            :aria-label="t('settings.back')"
            @click="router.back()"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>
        </div>
        <div class="hero-copy">
          <h1>{{ t("ai.title") }}</h1>
          <p>{{ t("settings.aiAssistantDesc") }}</p>
        </div>
      </header>

      <main class="settings-content">
        <div class="ai-main-column">
          <!-- API Keys Section -->
          <section class="settings-card ai-section ai-section--keys">
            <div class="settings-copy">
              <div class="settings-kicker">Key</div>
              <h2>{{ t("ai.apiKeys") }}</h2>
              <p>{{ t("ai.apiKeysDesc") }}</p>
            </div>
          </section>

          <div
            v-if="keys.length === 0 && !keyLoading"
            class="settings-card empty-card ai-section ai-section--keys"
          >
            <p>{{ t("ai.noKeys") }}</p>
          </div>

          <section
            v-for="item in keys"
            :key="item.id"
            class="settings-card key-card ai-section ai-section--keys"
          >
            <div class="settings-copy">
              <div class="settings-kicker">{{ item.provider }}</div>
              <h2>{{ item.keyName || item.maskedKey }}</h2>
              <p>{{ item.maskedKey }}</p>
            </div>
            <div class="key-actions">
              <span :class="['status-badge', item.validateStatus]">
                {{ item.validateStatus || "unchecked" }}
              </span>
              <button
                type="button"
                class="flat-button small"
                :disabled="testingId === item.id"
                @click="testKey(item.id)"
              >
                {{
                  testingId === item.id ? t("ai.testing") : t("ai.testConnection")
                }}
              </button>
              <button
                type="button"
                class="flat-button small"
                @click="removeKey(item.id)"
              >
                {{ t("ai.deleteKey") }}
              </button>
            </div>
          </section>

          <section class="settings-card ai-section ai-section--add-key">
            <div class="settings-copy">
              <div class="settings-kicker">Add</div>
              <h2>{{ t("ai.addKey") }}</h2>
            </div>
            <div class="add-key-form">
              <div class="add-key-field">
                <label>{{ t("ai.provider") }}</label>
                <el-select v-model="newProvider" size="large" style="width: 100%">
                  <el-option label="DeepSeek" value="deepseek" />
                  <el-option label="MiniMax" value="minimax" />
                  <el-option label="OpenAI" value="openai" />
                </el-select>
              </div>
              <div class="add-key-field">
                <label>{{ t("ai.apiKeyInput") }}</label>
                <el-input
                  v-model="newApiKey"
                  :placeholder="'sk-...'"
                  type="password"
                  show-password
                  size="large"
                  @keyup.enter="addKey"
                />
              </div>
              <div class="add-key-field">
                <label
                  >{{ t("ai.keyName") }}
                  <span class="optional">({{ t("common.optional") }})</span></label
                >
                <el-input
                  v-model="newKeyName"
                  :placeholder="t('ai.keyNamePlaceholder')"
                  size="large"
                />
              </div>
              <button
                type="button"
                class="flat-button"
                :disabled="!canAdd"
                @click="addKey"
              >
                {{ t("ai.save") }}
              </button>
            </div>
          </section>
        </div>

        <div class="ai-side-column">
          <!-- Auto Reply Section -->
          <section class="settings-card ai-section ai-section--auto-reply">
            <div class="settings-copy">
              <div class="settings-kicker">Auto</div>
              <h2>{{ t("ai.autoReply") }}</h2>
              <p>{{ t("ai.autoReplyDesc") }}</p>
            </div>
            <el-switch
              v-model="autoReplyEnabled"
              size="large"
              @change="updateAutoReply"
            />
          </section>

          <section v-if="autoReplyEnabled" class="settings-card ai-section ai-section--auto-reply">
            <div class="settings-copy" style="flex: 1">
              <div class="settings-kicker">Persona</div>
              <h2>{{ t("ai.autoReplyPersona") }}</h2>
              <p>{{ t("ai.autoReplyPersonaHint") }}</p>
            </div>
            <div style="width: 100%; margin-top: 12px">
              <el-input
                v-model="autoReplyPersona"
                type="textarea"
                :rows="4"
                :placeholder="t('ai.autoReplyPersonaPlaceholder')"
                @input="onPersonaInput"
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowLeft } from "@element-plus/icons-vue";
import { useI18nStore } from "@/stores/i18n";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { aiService } from "@/services/ai";
import type { AiApiKey } from "@/services/ai";

const router = useRouter();
const { t } = useI18nStore();
const { capture } = useErrorHandler("AiSettings");

const keys = ref<AiApiKey[]>([]);
const keyLoading = ref(false);
const testingId = ref<string | null>(null);
const autoReplyEnabled = ref(false);
const autoReplyPersona = ref("");
const settingsLoaded = ref(false);

const newProvider = ref("deepseek");
const newKeyName = ref("");
const newApiKey = ref("");

const canAdd = computed(() => newApiKey.value.trim().length > 0);

async function loadKeys() {
  keyLoading.value = true;
  try {
    const response = await aiService.listKeys();
    keys.value = response.data || [];
  } catch (err) {
    capture(err, "Failed to load API keys");
  } finally {
    keyLoading.value = false;
  }
}

async function addKey() {
  if (!canAdd.value) return;
  try {
    const response = await aiService.createKey({
      provider: newProvider.value,
      apiKey: newApiKey.value.trim(),
      keyName: newKeyName.value.trim(),
    });
    keys.value.unshift(response.data);
    newApiKey.value = "";
    newKeyName.value = "";
    ElMessage.success("Key 已添加");
  } catch (err) {
    capture(err, "Failed to add key");
  }
}

async function testKey(id: string) {
  testingId.value = id;
  try {
    const response = await aiService.testKey(id);
    const item = keys.value.find((k) => k.id === id);
    if (item) {
      item.validateStatus = response.data.validateStatus;
    }
    ElMessage.success(`状态: ${response.data.validateStatus}`);
  } catch (err) {
    capture(err, "Failed to test key");
  } finally {
    testingId.value = null;
  }
}

async function removeKey(id: string) {
  try {
    await ElMessageBox.confirm(t("ai.deleteConfirm"), t("ai.deleteKey"), {
      confirmButtonText: t("common.confirm"),
      cancelButtonText: t("common.cancel"),
      type: "warning",
    });
    await aiService.deleteKey(id);
    keys.value = keys.value.filter((k) => k.id !== id);
  } catch {
    /* cancelled */
  }
}

async function loadSettings() {
  try {
    const response = await aiService.getSettings();
    const s = response.data;
    autoReplyEnabled.value = s.autoReplyEnabled;
    autoReplyPersona.value = s.autoReplyPersona || "";
  } catch (err) {
    capture(err, "Failed to load AI settings");
  } finally {
    settingsLoaded.value = true;
  }
}

let personaTimer: ReturnType<typeof setTimeout> | null = null;

async function updateAutoReply() {
  try {
    await aiService.updateSettings({
      autoReplyEnabled: autoReplyEnabled.value,
    });
  } catch (err) {
    autoReplyEnabled.value = !autoReplyEnabled.value;
    capture(err, "Failed to update auto-reply");
  }
}

async function updatePersona() {
  try {
    await aiService.updateSettings({
      autoReplyPersona: autoReplyPersona.value,
    });
  } catch (err) {
    capture(err, "Failed to update persona");
  }
}

function onPersonaInput() {
  if (personaTimer) clearTimeout(personaTimer);
  personaTimer = setTimeout(() => updatePersona(), 500);
}

onMounted(() => {
  loadKeys();
  loadSettings();
});
</script>

<style lang="scss" scoped>
.ai-settings-page {
  min-height: 100%;
  padding: 16px var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--fresh-page-bg);
}

.ai-settings-shell {
  width: 100%;
  max-width: var(--web-content-max);
  margin: 0 auto;
}

.settings-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  height: 52px;

  .hero-actions {
    flex-shrink: 0;
  }

  .hero-copy {
    flex: 1;

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: var(--chat-text-primary);
    }

    p {
      margin: 4px 0 0;
      font-size: 14px;
      color: var(--chat-text-tertiary);
    }
  }
}

.icon-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--fresh-glass-border);
  background: var(--fresh-glass-bg);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  color: var(--fresh-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;

  &:hover {
    background: var(--fresh-glass-bg-strong);
  }
}

.settings-content {
  display: grid;
  grid-template-columns: minmax(520px, 1fr) 340px;
  gap: var(--web-gap);
  align-items: start;
}

.ai-main-column,
.ai-side-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-page);
  padding: 20px;
  flex-wrap: wrap;
  box-shadow: var(--fresh-glass-shadow-soft);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);

  &.key-card {
    padding-bottom: 12px;
  }
}

.settings-copy {
  flex: 1;
  min-width: 0;

  .settings-kicker {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fresh-green);
    margin-bottom: 4px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--chat-text-primary);
  }

  p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--chat-text-tertiary);
  }
}

.empty-card {
  justify-content: center;

  p {
    color: var(--chat-text-quaternary);
    font-size: 14px;
  }
}

.key-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--chat-bubble-system);
  color: var(--chat-text-tertiary);
  text-transform: uppercase;

  &.ok {
    background: rgba(var(--chat-success-rgb, 0, 200, 80), 0.15);
    color: var(--chat-success);
  }

  &.error {
    background: rgba(var(--chat-danger-rgb, 220, 60, 60), 0.15);
    color: var(--chat-danger);
  }
}

.flat-button {
  padding: 6px 16px;
  border-radius: 10px;
  border: none;
  background: var(--chat-bubble-other);
  color: var(--chat-text-primary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint));
    color: #fff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.small {
    padding: 4px 12px;
    font-size: 12px;
  }
}

.add-key-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.add-key-field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--chat-text-secondary);
  }

  .optional {
    font-weight: 400;
    color: var(--chat-text-quaternary);
    font-size: 12px;
  }
}

@media (max-width: 860px) {
  .settings-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .ai-settings-page {
    padding: 16px;
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }

  .settings-hero {
    gap: 12px;

    .hero-copy h1 {
      font-size: 20px;
    }
  }

  .settings-card {
    padding: 16px;
    gap: 12px;
  }

  .key-actions {
    flex-wrap: wrap;
  }
}

@media (max-width: 390px) {
  .ai-settings-page {
    padding: 12px;
  }

  .settings-card {
    padding: 14px;
    border-radius: 12px;
  }

  .settings-copy h2 {
    font-size: 15px;
  }
}
</style>
