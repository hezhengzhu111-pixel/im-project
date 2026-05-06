/**
 * E2EE 应用级初始化
 *
 * 在用户登录后调用，负责:
 * 1. 解析设备 ID
 * 2. 检查本地是否已有 Identity Key
 * 3. 若无 → 生成 Key Bundle 并上传到服务端
 * 4. 初始化 E2EE 管理器
 * 5. 启动设备心跳（30 分钟间隔）
 */

import { e2eeManager } from './e2ee-manager';
import { logger } from '@/utils/logger';
import { ensureLocalE2eeDeviceRegistered } from './local-device';
import { keyService } from '../api/key-service';

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 初始化 E2EE 子系统。
 *
 * 幂等 — 多次调用安全（已有 Identity Key 时跳过 Bundle 生成）。
 * 在 App.vue 的 initUserServices() 中调用。
 */
export async function initE2ee(): Promise<void> {
  try {
    const deviceId = await ensureLocalE2eeDeviceRegistered();
    await e2eeManager.init(deviceId);

    startDeviceHeartbeat(deviceId);
    logger.info('[E2EE] initialized', { deviceId });
  } catch (error) {
    // E2EE 初始化失败不应阻塞应用启动
    logger.warn('[E2EE] initialization failed, encryption will be unavailable', error);
  }
}

/**
 * 启动设备心跳定时器。
 * 定期向服务端上报设备活跃状态，防止设备被清理。
 */
function startDeviceHeartbeat(deviceId: string): void {
  stopDeviceHeartbeat();

  // 首次心跳立即发送
  void keyService.heartbeat(deviceId).catch((err) => {
    logger.warn('[E2EE] heartbeat failed', err);
  });

  heartbeatTimer = setInterval(() => {
    void keyService.heartbeat(deviceId).catch((err) => {
      logger.warn('[E2EE] heartbeat failed', err);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * 停止设备心跳。
 * 退出登录时调用。
 */
export function stopDeviceHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
