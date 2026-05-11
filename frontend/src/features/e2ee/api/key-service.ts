/**
 * E2EE 密钥 API 客户端
 *
 * 封装所有与 /api/keys/ 和 /api/e2ee/ 相关的 HTTP 请求。
 * 使用 @/utils/request 的 http 实例，所有方法返回 ApiResponse<T>。
 */

import { http } from '@/utils/request';
import type { ApiResponse } from '@/types/api';
import type {
  UploadBundleRequest,
  PreKeyBundle,
  E2eeDevice,
} from '../types';

// ---------------------------------------------------------------------------
// 响应类型
// ---------------------------------------------------------------------------

/** 恢复码备份数据（从服务端获取） */
export interface RecoveryBackupData {
  /** 加密后的公钥（Base64） */
  encryptedPubKey: string;
  /** AES-GCM 初始化向量（Base64） */
  iv: string;
}

/** 加密协商请求体 */
interface EncryptionNegotiationBody {
  sessionId: string;
  identityKey?: string;
  signedPreKey?: string;
  requestPayloadJson?: string;
}

export interface PendingEncryptionRequest {
  sessionId: string;
  requesterId: string;
  requesterName: string;
  targetUserId: string;
  requestPayloadJson?: string;
}

/** 群聊加密启用请求体 */
interface EnableGroupEncryptionBody {
  groupId: number;
  encryptedSenderKeys: Array<{
    userId: number;
    deviceId: string;
    encryptedSenderKey: string;
  }>;
}

/** 群聊加密禁用请求体 */
interface DisableGroupEncryptionBody {
  groupId: number;
}

// ---------------------------------------------------------------------------
// /api/keys/ 端点
// ---------------------------------------------------------------------------

export const keyService = {
  /**
   * 上传公钥 Bundle（Identity Key + Signed Pre Key + One-Time Pre Keys）
   * POST /api/keys/bundle
   */
  uploadBundle(data: UploadBundleRequest): Promise<ApiResponse<string>> {
    return http.post<string>('/keys/bundle', data);
  },

  /**
   * 获取指定用户的公钥 Bundle（用于 X3DH 密钥协商）
   * GET /api/keys/bundle?userId=xxx&deviceId=xxx
   *
   * @param userId - 目标用户 ID
   * @param deviceId - 目标设备 ID（可选，不传则返回主设备）
   */
  getBundle(userId: string, deviceId?: string): Promise<ApiResponse<PreKeyBundle>> {
    const params: Record<string, string> = { userId };
    if (deviceId) params.deviceId = deviceId;
    return http.get<PreKeyBundle>('/keys/bundle', { params });
  },

  /**
   * 获取用户的设备列表
   * GET /api/keys/devices?userId=xxx
   *
   * @param userId - 目标用户 ID（可选，不传则返回当前用户的设备）
   */
  getDevices(userId?: string): Promise<ApiResponse<E2eeDevice[]>> {
    const params: Record<string, string> = {};
    if (userId) params.userId = userId;
    return http.get<E2eeDevice[]>('/keys/devices', { params });
  },

  /**
   * 设备心跳（上报设备在线状态 + 刷新设备活跃时间）
   * POST /api/keys/heartbeat
   */
  heartbeat(deviceId: string): Promise<ApiResponse<string>> {
    return http.post<string>('/keys/heartbeat', { deviceId });
  },

  /**
   * 获取恢复码加密用的 salt（Base64）
   * 服务端为每个用户生成随机 salt，首次请求时创建并持久化。
   * GET /api/keys/salt
   */
  getSalt(): Promise<ApiResponse<string>> {
    return http.get<string>('/keys/salt');
  },

  /**
   * 上传恢复码备份（加密后的公钥）
   * POST /api/keys/backup
   *
   * @param encryptedPubKey - PBKDF2 派生密钥加密后的公钥（Base64）
   * @param iv - AES-GCM 初始化向量（Base64）
   */
  uploadBackup(encryptedPubKey: string, iv: string): Promise<ApiResponse<string>> {
    return http.post<string>('/keys/backup', { encryptedPubKey, iv });
  },

  /**
   * 获取恢复码备份
   * GET /api/keys/backup
   *
   * @returns 加密后的公钥和 IV
   */
  getBackup(): Promise<ApiResponse<RecoveryBackupData>> {
    return http.get<RecoveryBackupData>('/keys/backup');
  },

  /**
   * 删除指定设备（撤销其密钥）
   * DELETE /api/keys/device/:id
   *
   * @param deviceId - 要删除的设备 ID
   */
  deleteDevice(deviceId: string): Promise<ApiResponse<string>> {
    return http.delete<string>(`/keys/device/${encodeURIComponent(deviceId)}`);
  },

  // -----------------------------------------------------------------------
  // /api/e2ee/ 端点 — 加密协商
  // -----------------------------------------------------------------------

  /**
   * 请求开启私聊加密协商
   * POST /api/e2ee/request
   *
   * @param sessionId - 会话 ID
   * @param identityKey - 发起方 Identity Key（Base64，可选）
   * @param signedPreKey - 发起方 Signed Pre Key（Base64，可选）
   */
  requestEncryption(
    sessionId: string,
    identityKey?: string,
    signedPreKey?: string,
    requestPayloadJson?: string,
  ): Promise<ApiResponse<string>> {
    const body: EncryptionNegotiationBody = { sessionId };
    if (identityKey) body.identityKey = identityKey;
    if (signedPreKey) body.signedPreKey = signedPreKey;
    if (requestPayloadJson) body.requestPayloadJson = requestPayloadJson;
    return http.post<string>('/e2ee/request', body);
  },

  /**
   * 接受私聊加密协商
   * POST /api/e2ee/accept
   *
   * @param sessionId - 会话 ID
   * @param identityKey - 接受方 Identity Key（Base64，可选）
   * @param signedPreKey - 接受方 Signed Pre Key（Base64，可选）
   */
  acceptEncryption(
    sessionId: string,
    identityKey?: string,
    signedPreKey?: string,
  ): Promise<ApiResponse<string>> {
    const body: EncryptionNegotiationBody = { sessionId };
    if (identityKey) body.identityKey = identityKey;
    if (signedPreKey) body.signedPreKey = signedPreKey;
    return http.post<string>('/e2ee/accept', body);
  },

  /**
   * 拒绝私聊加密协商
   * POST /api/e2ee/reject
   *
   * @param sessionId - 会话 ID
   */
  rejectEncryption(sessionId: string): Promise<ApiResponse<string>> {
    return http.post<string>('/e2ee/reject', { sessionId });
  },

  /**
   * 退出私聊端到端加密通道
   * POST /api/e2ee/disable
   */
  disableEncryption(sessionId: string): Promise<ApiResponse<string>> {
    return http.post<string>('/e2ee/disable', { sessionId });
  },

  /**
   * 获取当前用户待确认的私聊加密协商请求
   * GET /api/e2ee/pending
   */
  getPendingNegotiations(): Promise<ApiResponse<PendingEncryptionRequest[]>> {
    return http.get<PendingEncryptionRequest[]>('/e2ee/pending');
  },

  /**
   * 启用群聊加密
   * POST /api/e2ee/group/enable
   *
   * @param groupId - 群组 ID
   * @param encryptedSenderKeys - 加密后的 Sender Key 列表
   */
  enableGroupEncryption(
    groupId: number,
    encryptedSenderKeys: EnableGroupEncryptionBody['encryptedSenderKeys'],
  ): Promise<ApiResponse<string>> {
    return http.post<string>('/e2ee/group/enable', {
      groupId,
      encryptedSenderKeys,
    });
  },

  /**
   * 禁用群聊加密
   * POST /api/e2ee/group/disable
   *
   * @param groupId - 群组 ID
   */
  disableGroupEncryption(groupId: number): Promise<ApiResponse<string>> {
    return http.post<string>('/e2ee/group/disable', { groupId });
  },
};
