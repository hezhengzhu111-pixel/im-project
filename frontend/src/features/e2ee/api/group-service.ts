/**
 * E2EE 群聊加密 API 客户端
 *
 * 封装与 /api/e2ee/groups 相关的群聊加密 HTTP 请求。
 * 使用 @/utils/request 的 http 实例，所有方法返回 ApiResponse<T>。
 */

import { http } from '@/utils/request';
import type { ApiResponse } from '@/types/api';

/** 加密后的 Sender Key 条目 */
interface EncryptedSenderKeyEntry {
  recipientId: string;
  deviceId: string;
  encryptedSenderKey: string;
}

/** 服务端返回的 Sender Key 条目 */
interface SenderKeyEntry {
  senderId: string;
  deviceId: string;
  encryptedSenderKey: string;
  counter: number;
}

/** 群聊加密状态 */
interface GroupEncryptionStatus {
  status: 'plaintext' | 'encrypted';
  enabledBy?: string;
}

export const e2eeGroupService = {
  /**
   * 启用群聊加密
   * POST /api/e2ee/groups/:groupId/enable
   *
   * 群管理员调用，批量分发加密后的 Sender Key 给所有群成员。
   *
   * @param groupId - 群组 ID
   * @param senderKeys - 加密后的 Sender Key 列表
   */
  async enableGroupEncryption(
    groupId: string,
    senderKeys: EncryptedSenderKeyEntry[],
  ): Promise<ApiResponse<string>> {
    return http.post<string>(`/e2ee/groups/${encodeURIComponent(groupId)}/enable`, {
      senderKeys,
    });
  },

  /**
   * 向单个群成员推送 Sender Key
   * POST /api/e2ee/groups/:groupId/sender-key
   *
   * 新成员加入群聊时，已有成员向其推送自己的 Sender Key。
   *
   * @param groupId - 群组 ID
   * @param recipientId - 接收者用户 ID
   * @param deviceId - 接收者设备 ID
   * @param encryptedSenderKey - 加密后的 Sender Key（Base64）
   */
  async pushSenderKeyToMember(
    groupId: string,
    recipientId: string,
    deviceId: string,
    encryptedSenderKey: string,
  ): Promise<ApiResponse<string>> {
    return http.post<string>(`/e2ee/groups/${encodeURIComponent(groupId)}/sender-key`, {
      recipientId,
      deviceId,
      encryptedSenderKey,
    });
  },

  /**
   * 获取当前用户在群组中收到的所有 Sender Key
   * GET /api/e2ee/groups/:groupId/sender-keys
   *
   * @param groupId - 群组 ID
   */
  async getMySenderKeys(groupId: string): Promise<ApiResponse<SenderKeyEntry[]>> {
    return http.get<SenderKeyEntry[]>(
      `/e2ee/groups/${encodeURIComponent(groupId)}/sender-keys`,
    );
  },

  /**
   * 删除指定成员的 Sender Key
   * DELETE /api/e2ee/groups/:groupId/sender-keys/:userId
   *
   * 成员退出群聊时清理其 Sender Key。
   *
   * @param groupId - 群组 ID
   * @param userId - 要删除的用户 ID
   */
  async removeMemberSenderKeys(
    groupId: string,
    userId: string,
  ): Promise<ApiResponse<string>> {
    return http.delete<string>(
      `/e2ee/groups/${encodeURIComponent(groupId)}/sender-keys/${encodeURIComponent(userId)}`,
    );
  },

  /**
   * 获取群聊加密状态
   * GET /api/e2ee/groups/:groupId/status
   *
   * @param groupId - 群组 ID
   */
  async getGroupEncryptionStatus(
    groupId: string,
  ): Promise<ApiResponse<GroupEncryptionStatus>> {
    return http.get<GroupEncryptionStatus>(
      `/e2ee/groups/${encodeURIComponent(groupId)}/status`,
    );
  },
};
