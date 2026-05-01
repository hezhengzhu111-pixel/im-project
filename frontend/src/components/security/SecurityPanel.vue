<template>
  <div class="security-panel">
    <div class="panel-header">
      <span class="panel-title">安全信息</span>
      <button type="button" class="panel-close" @click="emit('close')">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="panel-body">
      <div class="security-status">
        <div class="status-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div class="status-text">
          <span class="status-label">端对端加密已启用</span>
          <span class="status-desc">消息在设备上加密和解密，服务器无法读取内容。</span>
        </div>
      </div>

      <div class="info-list">
        <div class="info-item">
          <span class="info-label">加密协议</span>
          <span class="info-value">AES-256-GCM</span>
        </div>
        <div class="info-item">
          <span class="info-label">会话密钥状态</span>
          <span class="info-value info-value-ok">活跃</span>
        </div>
        <div class="info-item">
          <span class="info-label">密钥管理</span>
          <span class="info-value">由后端加密模块维护</span>
        </div>
        <div class="info-item">
          <span class="info-label">设备信息</span>
          <span class="info-value">当前版本未返回设备详情</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {Close} from "@element-plus/icons-vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<style scoped lang="scss">
.security-panel {
  background: var(--surface-overlay, rgba(255, 255, 255, 0.86));
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm, 8px);
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background: var(--surface-elevated);
    color: var(--text-primary);
  }
}

.panel-body {
  padding: 16px;
}

.security-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-md, 12px);
  background: color-mix(in srgb, var(--color-success, #22c55e), transparent 92%);
  border: 1px solid color-mix(in srgb, var(--color-success, #22c55e), transparent 75%);
  margin-bottom: 16px;
}

.status-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm, 8px);
  background: color-mix(in srgb, var(--color-success, #22c55e), transparent 85%);
  color: var(--color-success, #22c55e);
  flex-shrink: 0;
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.status-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--border-light);
  border-radius: var(--radius-sm, 8px);
  overflow: hidden;
}

.info-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface-elevated);
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.info-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-value-ok {
  color: var(--color-success, #22c55e);
}
</style>
