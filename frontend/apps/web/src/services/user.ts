import {
  normalizeUser,
  normalizeUserAuthResponse,
  normalizeUserSettings,
} from "@/normalizers/user";
import { http } from "@/utils/request";
import { USER_ENDPOINTS } from "@im/shared-api-contract";
import type { ApiResponse } from "@/types/api";
import type {
  BindEmailRequest,
  BindPhoneRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  LoginRequest,
  RegisterRequest,
  UpdateUserRequest,
  User,
  UserAuthResponse,
  UserSettings,
} from "@/types";

export const userService = {
  async login(data: LoginRequest): Promise<ApiResponse<UserAuthResponse>> {
    const response = await http.post<unknown>(USER_ENDPOINTS.LOGIN, data);
    return {
      ...response,
      data: normalizeUserAuthResponse(response.data),
    } as typeof response & { data: UserAuthResponse };
  },
  register: (data: RegisterRequest) => http.post<User>(USER_ENDPOINTS.REGISTER, data),
  updateProfile: async (data: UpdateUserRequest) => {
    const response = await http.put<unknown>(USER_ENDPOINTS.PROFILE, data);
    return {
      ...response,
      data: normalizeUser(response.data as User),
    } as typeof response & { data: User };
  },
  async search(keyword: string, type = "username") {
    const response = await http.get<unknown[]>(USER_ENDPOINTS.SEARCH, {
      params: { keyword, type },
    });
    return {
      ...response,
      data: Array.isArray(response.data)
        ? response.data.map((item) => normalizeUser(item as User))
        : [],
    } as typeof response & { data: User[] };
  },
  logout: () => http.post<string>(USER_ENDPOINTS.LOGOUT),
  heartbeat: (userIds: string[]) =>
    http.post<Record<string, boolean>>(USER_ENDPOINTS.HEARTBEAT, userIds),
  checkOnlineStatus: (userIds: string[]) =>
    http.post<Record<string, boolean>>(USER_ENDPOINTS.ONLINE_STATUS, userIds),
  changePassword: (data: ChangePasswordRequest) =>
    http.put<boolean>(USER_ENDPOINTS.PASSWORD, data),
  sendPhoneCode: (target: string) =>
    http.post<string>(USER_ENDPOINTS.PHONE_CODE, { target }),
  bindPhone: (data: BindPhoneRequest) =>
    http.post<boolean>(USER_ENDPOINTS.PHONE_BIND, data),
  sendEmailCode: (target: string) =>
    http.post<string>(USER_ENDPOINTS.EMAIL_CODE, { target }),
  bindEmail: (data: BindEmailRequest) =>
    http.post<boolean>(USER_ENDPOINTS.EMAIL_BIND, data),
  deleteAccount: (data: DeleteAccountRequest) =>
    http.delete<boolean>(USER_ENDPOINTS.ACCOUNT, undefined, { data }),
  async getSettings() {
    const response = await http.get<unknown>(USER_ENDPOINTS.SETTINGS);
    return {
      ...response,
      data: normalizeUserSettings(response.data),
    } as typeof response & { data: UserSettings };
  },
  updateSettings: (type: string, data: Record<string, unknown>) =>
    http.put<boolean>(USER_ENDPOINTS.SETTINGS_TYPE.replace(":type", type), data),
};
