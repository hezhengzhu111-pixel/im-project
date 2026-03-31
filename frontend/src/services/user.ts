import { normalizeUser, normalizeUserAuthResponse, normalizeUserSettings } from "@/normalizers/user";
import { http } from "@/utils/request";
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
  async login(data: LoginRequest): Promise<UserAuthResponse> {
    const response = await http.post<unknown>("/user/login", data);
    return {
      ...response,
      data: normalizeUserAuthResponse(response.data),
    } as typeof response & { data: UserAuthResponse };
  },
  register: (data: RegisterRequest) => http.post<User>("/user/register", data),
  updateProfile: async (data: UpdateUserRequest) => {
    const response = await http.put<unknown>("/user/profile", data);
    return {
      ...response,
      data: normalizeUser(response.data),
    } as typeof response & { data: User };
  },
  async search(keyword: string, type = "username") {
    const response = await http.get<unknown[]>("/user/search", {
      params: { keyword, type },
    });
    return {
      ...response,
      data: Array.isArray(response.data)
        ? response.data.map((item) => normalizeUser(item))
        : [],
    } as typeof response & { data: User[] };
  },
  logout: () => http.post<string>("/user/logout"),
  heartbeat: (userIds: string[]) =>
    http.post<Record<string, boolean>>("/user/heartbeat", userIds),
  online: () => http.post<string>("/user/online"),
  checkOnlineStatus: (userIds: string[]) =>
    http.post<Record<string, boolean>>("/user/online-status", userIds),
  changePassword: (data: ChangePasswordRequest) =>
    http.put<boolean>("/user/password", data),
  sendPhoneCode: (target: string) =>
    http.post<string>("/user/phone/code", { target }),
  bindPhone: (data: BindPhoneRequest) =>
    http.post<boolean>("/user/phone/bind", data),
  sendEmailCode: (target: string) =>
    http.post<string>("/user/email/code", { target }),
  bindEmail: (data: BindEmailRequest) =>
    http.post<boolean>("/user/email/bind", data),
  deleteAccount: (data: DeleteAccountRequest) =>
    http.delete<boolean>("/user/account", undefined, { data }),
  async getSettings() {
    const response = await http.get<unknown>("/user/settings");
    return {
      ...response,
      data: normalizeUserSettings(response.data),
    } as typeof response & { data: UserSettings };
  },
  updateSettings: (type: string, data: Record<string, unknown>) =>
    http.put<boolean>(`/user/settings/${type}`, data),
};
