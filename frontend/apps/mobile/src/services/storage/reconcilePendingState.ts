import { pendingMessageRepository } from './pendingMessageRepository';
import { uploadTaskRepository } from './uploadTaskRepository';
import { RECONCILE_CONFIG, RETRY_CONFIG } from '@/constants/config';
import { logger } from '@/utils/logger';

/**
 * App 启动/前台恢复时恢复卡死的 pending message 和 upload task 状态。
 *
 * 规则：
 * 1. pending.status='sending' 且 updatedAt 超过 staleSendingMs → 恢复到 pending 或 failed
 * 2. uploadTask.status='uploading' 且 updatedAt 超过 staleUploadingMs → 恢复到 pending 或 failed
 * 3. uploadTask 已 uploaded + pending 存在但 payload 缺 mediaUrl → 补写 remoteUrl
 *
 * 不处理：
 * - future nextRetryAt 不提前重试
 * - status='sent' 或 'blocked' 不处理
 * - 不会删除用户 pending 数据
 */
export function reconcilePendingState(): void {
  const now = Date.now();

  // ─── 1. 恢复卡死的 sending → pending 或 failed ───
  const allPending = pendingMessageRepository.listAll();
  for (const item of allPending) {
    if (item.status === 'sending') {
      const age = now - item.updatedAt;
      if (age > RECONCILE_CONFIG.staleSendingMs) {
        if (item.retryCount >= RETRY_CONFIG.maxRetryCount) {
          pendingMessageRepository.update({
            ...item,
            status: 'failed',
            lastError: `stale sending recovered: stuck for ${age}ms`,
          });
          logger.warn('reconcile', 'recovered stale sending → failed', {
            localId: item.localId,
            age,
          });
        } else {
          pendingMessageRepository.update({
            ...item,
            status: 'pending',
            lastError: `stale sending recovered: stuck for ${age}ms`,
          });
          logger.warn('reconcile', 'recovered stale sending → pending', {
            localId: item.localId,
            age,
          });
        }
      }
    }
  }

  // ─── 2. 恢复卡死的 uploading → pending 或 failed ───
  const allUploadTasks = uploadTaskRepository.listAll();
  for (const task of allUploadTasks) {
    if (task.status === 'uploading') {
      const age = now - task.updatedAt;
      if (age > RECONCILE_CONFIG.staleUploadingMs) {
        const maxRetry = task.maxRetryCount ?? RETRY_CONFIG.maxRetryCount;
        if (task.retryCount >= maxRetry) {
          uploadTaskRepository.upsert({
            ...task,
            status: 'failed',
            lastError: `stale uploading recovered: stuck for ${age}ms`,
            updatedAt: now,
          });
          logger.warn('reconcile', 'recovered stale uploading → failed', {
            taskId: task.taskId,
            age,
          });
        } else {
          uploadTaskRepository.upsert({
            ...task,
            status: 'pending',
            lastError: `stale uploading recovered: stuck for ${age}ms`,
            updatedAt: now,
          });
          logger.warn('reconcile', 'recovered stale uploading → pending', {
            taskId: task.taskId,
            age,
          });
        }
      }
    }
  }

  // ─── 3. uploaded uploadTask + pending 缺 mediaUrl → 补写 ───
  for (const pending of allPending) {
    try {
      const payload = JSON.parse(pending.payloadJson) as {
        sendType?: string;
        data?: { mediaUrl?: string; mediaName?: string; mediaSize?: number };
        uploadTaskId?: string;
      };
      if (!payload.uploadTaskId) continue;

      const task = uploadTaskRepository.get(payload.uploadTaskId);
      if (!task || task.status !== 'uploaded' || !task.remoteUrl) continue;

      const data = payload.data ?? {};
      const isRemoteUrl =
        data.mediaUrl?.startsWith('https://') || data.mediaUrl?.startsWith('http://');

      if (!isRemoteUrl) {
        pendingMessageRepository.update({
          ...pending,
          payloadJson: JSON.stringify({
            ...payload,
            data: {
              ...data,
              mediaUrl: task.remoteUrl,
              mediaName: task.fileName || data.mediaName,
              mediaSize: task.fileSize || data.mediaSize,
            },
          }),
        });
        logger.info('reconcile', 'repaired mediaUrl in pending from uploaded task', {
          localId: pending.localId,
          taskId: task.taskId,
          mediaUrl: task.remoteUrl,
        });
      }
    } catch {
      // 跳过损坏的 payload
    }
  }
}
