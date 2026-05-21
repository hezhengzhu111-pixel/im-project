import { http } from '@/services/api/httpClient';
import type { ApiResponse } from '@im/shared-types';
import type { E2eeDevice, PendingEncryptionRequest, PreKeyBundle, UploadBundleRequest } from '@im/shared-e2ee-core';

export const mobileE2eeKeyService = {
  uploadBundle(data: UploadBundleRequest): Promise<ApiResponse<string>> {
    return http.post<string>('/keys/bundle', data);
  },

  getBundle(
    userId: string,
    deviceId?: string,
    options?: {
      conversationId?: string;
      requesterDeviceId?: string;
    },
  ): Promise<ApiResponse<PreKeyBundle>> {
    const params: Record<string, string> = { userId };
    if (deviceId) {
      params.deviceId = deviceId;
    }
    if (options?.conversationId) {
      params.conversationId = options.conversationId;
    }
    if (options?.requesterDeviceId) {
      params.requesterDeviceId = options.requesterDeviceId;
    }
    return http.get<PreKeyBundle>('/keys/bundle', { params } as never);
  },

  getDevices(userId?: string): Promise<ApiResponse<E2eeDevice[]>> {
    const params: Record<string, string> = {};
    if (userId) {
      params.userId = userId;
    }
    return http.get<E2eeDevice[]>('/keys/devices', { params } as never);
  },

  heartbeat(deviceId: string): Promise<ApiResponse<string>> {
    return http.post<string>('/keys/heartbeat', { deviceId });
  },

  requestEncryption(
    sessionId: string,
    identityKey?: string,
    signedPreKey?: string,
    requestPayloadJson?: string,
  ): Promise<ApiResponse<string>> {
    const body: Record<string, string> = { sessionId };
    if (identityKey) body.identityKey = identityKey;
    if (signedPreKey) body.signedPreKey = signedPreKey;
    if (requestPayloadJson) body.requestPayloadJson = requestPayloadJson;
    return http.post<string>('/e2ee/request', body);
  },

  getPendingNegotiations(): Promise<ApiResponse<PendingEncryptionRequest[]>> {
    return http.get<PendingEncryptionRequest[]>('/e2ee/pending');
  },

  acceptEncryption(sessionId: string, identityKey?: string, signedPreKey?: string): Promise<ApiResponse<string>> {
    const body: Record<string, string> = { sessionId };
    if (identityKey) body.identityKey = identityKey;
    if (signedPreKey) body.signedPreKey = signedPreKey;
    return http.post<string>('/e2ee/accept', body);
  },

  rejectEncryption(sessionId: string): Promise<ApiResponse<string>> {
    return http.post<string>('/e2ee/reject', { sessionId });
  },

  disableEncryption(sessionId: string): Promise<ApiResponse<string>> {
    return http.post<string>('/e2ee/disable', { sessionId });
  },
};

