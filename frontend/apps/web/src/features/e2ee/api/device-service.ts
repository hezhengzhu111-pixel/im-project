/**
 * E2EE 设备 API 客户端
 *
 * 封装与 /api/e2ee/devices 和 /api/e2ee/groups 相关的设备查询请求。
 * 使用 @/utils/request 的 http 实例，所有方法返回 ApiResponse<T>。
 */

import { http } from '@/utils/request';
import type { ApiResponse } from '@/types/api';
import type { E2eeDevice } from '../types';

export const deviceService = {
  /**
   * 获取指定用户的 E2EE 设备列表
   * GET /api/e2ee/devices/:userId
   *
   * @param userId - 目标用户 ID
   */
  async getUserDevices(userId: string): Promise<ApiResponse<E2eeDevice[]>> {
    const response = await http.get<unknown[]>(`/e2ee/devices/${encodeURIComponent(userId)}`);
    return response as ApiResponse<E2eeDevice[]>;
  },

  /**
   * 获取群组内所有成员的 E2EE 设备列表
   * GET /api/e2ee/groups/:groupId/devices
   *
   * @param groupId - 群组 ID
   */
  async getGroupDevices(groupId: string): Promise<ApiResponse<E2eeDevice[]>> {
    const response = await http.get<unknown[]>(`/e2ee/groups/${encodeURIComponent(groupId)}/devices`);
    return response as ApiResponse<E2eeDevice[]>;
  },
};
