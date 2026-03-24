import { http } from "@/utils/request";
import type {
  UserDTO,
  LoginRequest,
  UserAuthResponse,
  RegisterRequest,
  UpdateUserRequest,
  UserSearchResult,
} from "@/types/user";

export const userService = {
  login: (data: LoginRequest) =>
    http.post<UserAuthResponse>("/user/login", data),
  register: (data: RegisterRequest) =>
    http.post<UserDTO>("/user/register", data),
  updateProfile: (data: UpdateUserRequest) =>
    http.put<boolean>("/user/profile", data),
  search: (keyword: string, type: string = "username") =>
    http.get<UserDTO[]>("/user/search", { params: { keyword, type } }),
  logout: () => http.post<string>("/user/logout"),
  heartbeat: (userIds: string[]) =>
    http.post<Record<string, boolean>>("/user/heartbeat", userIds),
  online: () => http.post<string>("/user/online"),
  checkOnlineStatus: (userIds: string[]) =>
    http.post<Record<string, boolean>>("/user/online-status", userIds),

  // 账号安全相关
  changePassword: (data: any) => http.put<boolean>("/user/password", data),
  sendPhoneCode: (target: string) => http.post<string>("/user/phone/code", { target }),
  bindPhone: (data: any) => http.post<boolean>("/user/phone/bind", data),
  sendEmailCode: (target: string) => http.post<string>("/user/email/code", { target }),
  bindEmail: (data: any) => http.post<boolean>("/user/email/bind", data),
  deleteAccount: (data: any) => http.delete<boolean>("/user/account", { data }),

  // 设置相关
  getSettings: () => http.get<any>("/user/settings"),
  updateSettings: (type: string, data: any) => http.put<boolean>(`/user/settings/${type}`, data),
};
