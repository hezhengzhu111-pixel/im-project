import { USER_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { normalizeAuthResponse, normalizeSettings, normalizeUser } from '@/utils/normalizers';
import type { ApiResponse, LoginRequest, RegisterRequest, User, UserAuthResponse, UserSettings } from '@/types/models';

export const userService = {
  async login(data: LoginRequest): Promise<ApiResponse<UserAuthResponse>> {
    const response = await http.post<unknown>(USER_ENDPOINTS.LOGIN, data);
    return { ...response, data: normalizeAuthResponse(response.data) };
  },

  register(data: RegisterRequest): Promise<ApiResponse<User>> {
    return http.post<User>(USER_ENDPOINTS.REGISTER, data);
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    const response = await http.put<unknown>(USER_ENDPOINTS.PROFILE, data);
    return { ...response, data: normalizeUser(response.data) };
  },

  async search(keyword: string, type = 'username'): Promise<ApiResponse<User[]>> {
    const response = await http.get<unknown[]>(USER_ENDPOINTS.SEARCH, {
      params: { keyword, type },
    } as never);
    return {
      ...response,
      data: Array.isArray(response.data) ? response.data.map(normalizeUser) : [],
    };
  },

  logout: () => http.post<string>(USER_ENDPOINTS.LOGOUT),
  checkOnlineStatus: (userIds: string[]) => http.post<Record<string, boolean>>(USER_ENDPOINTS.ONLINE_STATUS, userIds),
  changePassword: (data: { oldPassword: string; newPassword: string }) => http.put<boolean>(USER_ENDPOINTS.PASSWORD, data),
  sendPhoneCode: (target: string) => http.post<string>(USER_ENDPOINTS.PHONE_CODE, { target }),
  bindPhone: (data: { phone: string; code: string }) => http.post<boolean>(USER_ENDPOINTS.PHONE_BIND, data),
  sendEmailCode: (target: string) => http.post<string>(USER_ENDPOINTS.EMAIL_CODE, { target }),
  bindEmail: (data: { email: string; code: string }) => http.post<boolean>(USER_ENDPOINTS.EMAIL_BIND, data),

  async getSettings(): Promise<ApiResponse<UserSettings>> {
    const response = await http.get<unknown>(USER_ENDPOINTS.SETTINGS);
    return { ...response, data: normalizeSettings(response.data) };
  },

  updateSettings: (type: string, data: Record<string, unknown>) =>
    http.put<boolean>(USER_ENDPOINTS.SETTINGS_TYPE.replace(':type', type), data),
};
